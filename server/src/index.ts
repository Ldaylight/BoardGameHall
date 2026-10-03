import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { config } from './config.js';
import { MemoryStore, RedisStore, type RoomStore } from './services/store.js';
import {
  addFriend,
  authenticate,
  getUser,
  prisma,
  profile,
  session,
  updateUser,
} from './services/database.js';
import { RoomService, type GameServer } from './services/rooms.js';
import { registerSockets } from './realtime/socket.js';
import { games } from '../../shared/catalog.js';
const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.origin }));
app.use(express.json({ limit: '16kb' }));
const http = createServer(app);
const io: GameServer = new Server(http, {
  cors: { origin: config.origin },
  maxHttpBufferSize: 16384,
  transports: ['websocket'],
});
if (config.redisUrl && config.demo)
  throw new Error('Redis multi-instance mode requires DEMO_MODE=false so user identities persist in MySQL.');
const store: RoomStore = config.redisUrl ? new RedisStore(config.redisUrl) : new MemoryStore();
const adapterClients: Redis[] = [];
if (store.redis) {
  const pub = store.redis.duplicate();
  const sub = store.redis.duplicate();
  adapterClients.push(pub, sub);
  await Promise.all([pub.ping(), sub.ping()]);
  io.adapter(createAdapter(pub, sub));
}
if (prisma) {
  await prisma.$connect();
  for (const game of games) {
    const data = {
      name: game.name,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      available: game.available,
    };
    await prisma.game.upsert({ where: { id: game.id }, create: { id: game.id, ...data }, update: data });
  }
}
const rooms = new RoomService(store, io);
const stopPresence = registerSockets(io, rooms);
const route =
  (handler: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
  (req, res, next) => {
    void handler(req, res).catch(next);
  };
async function auth(req: express.Request) {
  const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const user = await authenticate(token);
  if (!user) throw new Error('请刷新页面重新建立访客身份');
  return user;
}
// Local sliding-window throttle on guest creation; use a gateway shared limiter for public clusters.
const sessions = new Map<string, { count: number; expires: number }>();
app.post(
  '/api/session',
  route(async (req, res) => {
    const p = z
      .object({ name: z.string().trim().min(1).max(20), token: z.string().max(128).nullable().optional() })
      .parse(req.body);
    const ip = req.ip ?? 'local';
    let bucket = sessions.get(ip);
    if (!bucket || bucket.expires < Date.now()) {
      bucket = { count: 0, expires: Date.now() + 60000 };
      sessions.set(ip, bucket);
    }
    if (!p.token && ++bucket.count > 30) {
      res.status(429).json({ ok: false, error: '创建访客过快，请一分钟后重试' });
      return;
    }
    res.json({ ok: true, data: await session(p.name, p.token ?? undefined) });
  }),
);
app.get(
  '/api/health',
  route(async (_req, res) => {
    if (prisma) await prisma.$queryRaw`SELECT 1`;
    if (store.redis) await store.redis.ping();
    res.json({
      ok: true,
      data: {
        mode: config.demo ? 'demo' : 'mysql',
        roomStore: config.redisUrl ? 'redis' : 'memory',
        version: '1.0.0',
      },
    });
  }),
);
app.get('/api/games', (_req, res) => res.json({ ok: true, data: games }));
app.get(
  '/api/rooms',
  route(async (_req, res) => res.json({ ok: true, data: await rooms.list() })),
);
app.get(
  '/api/profile',
  route(async (req, res) => res.json({ ok: true, data: await profile((await auth(req)).id) })),
);
app.patch(
  '/api/profile',
  route(async (req, res) => {
    const u = await auth(req);
    const p = z.object({ name: z.string().trim().min(1).max(20) }).parse(req.body);
    res.json({ ok: true, data: await updateUser(u.id, p.name) });
  }),
);
app.post(
  '/api/friends',
  route(async (req, res) => {
    const u = await auth(req);
    const p = z.object({ userId: z.string().uuid() }).parse(req.body);
    await addFriend(u.id, p.userId);
    res.json({ ok: true, data: null });
  }),
);
const staticRoot = fileURLToPath(new URL('../../../client/', import.meta.url));
// Only built server serves SPA assets; during development Vite provides the UI.
if (process.env.NODE_ENV === 'production' || import.meta.url.includes('/dist/')) {
  app.use(express.static(staticRoot));
  app.get('*', (_req, res) => res.sendFile(`${staticRoot}index.html`));
}
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const validation = error instanceof z.ZodError;
  const message = validation ? '请求参数无效' : error instanceof Error ? error.message : '服务暂时不可用';
  res.status(validation ? 400 : 500).json({ ok: false, error: message });
});
let ticking = false;
const timer = setInterval(() => {
  if (ticking) return;
  ticking = true;
  void rooms
    .tick()
    .catch((e) => console.error('Room tick:', e))
    .finally(() => {
      ticking = false;
    });
}, 100);
http.listen(config.port, '0.0.0.0', () =>
  console.log(
    `PLAYROOM ${config.demo ? 'DEMO' : 'MYSQL'} API + Socket.IO at http://localhost:${config.port}; rooms: ${config.redisUrl ? 'Redis' : 'memory'}`,
  ),
);
function shutdown() {
  clearInterval(timer);
  stopPresence();
  io.close();
  http.close();
  void prisma?.$disconnect();
  void store.redis?.quit();
  for (const client of adapterClients) void client.quit();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
