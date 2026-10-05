import { z } from 'zod';
import type { Ack } from '../../../shared/types.js';
import { authenticate } from '../services/database.js';
import { RoomService, type GameServer } from '../services/rooms.js';
import { kittenKinds } from '../../../shared/games/exploding-kittens/types.js';
const difficulty = z.enum(['easy', 'medium', 'hard']);
const id = z.string().uuid();
const room = z.object({ roomId: id });
const action = z.union([
  z
    .object({ type: z.enum(['poker:fold', 'poker:check', 'poker:call', 'poker:all-in', 'poker:next']) })
    .strict(),
  z.object({ type: z.literal('poker:ready'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('poker:raise'), amount: z.number().int().min(1).max(60000) }).strict(),
  z
    .object({
      type: z.literal('ek:play'),
      cardIds: z.array(z.string().min(1).max(30)).min(1).max(3),
      targetId: z.string().min(1).max(80).optional(),
      requestKind: z.enum(kittenKinds).optional(),
    })
    .strict(),
  z.object({ type: z.literal('ek:draw') }).strict(),
  z
    .object({
      type: z.literal('ek:nope'),
      cardId: z.string().min(1).max(30),
      pendingId: z.string().min(1).max(80),
    })
    .strict(),
  z.object({ type: z.literal('ek:allow'), pendingId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal('ek:give'), cardId: z.string().min(1).max(30) }).strict(),
  z.object({ type: z.literal('ek:defuse'), cardId: z.string().min(1).max(30) }).strict(),
  z.object({ type: z.literal('ek:insert'), index: z.number().int().min(0).max(56) }).strict(),
  z.object({ type: z.literal('ek:continue') }).strict(),
  z
    .object({
      type: z.literal('bid'),
      value: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    })
    .strict(),
  z.object({ type: z.literal('play'), cardIds: z.array(z.string().min(1).max(20)).min(1).max(20) }).strict(),
  z
    .object({
      type: z.literal('move'),
      from: z.object({ x: z.number().int().min(0).max(8), y: z.number().int().min(0).max(9) }).strict(),
      to: z.object({ x: z.number().int().min(0).max(8), y: z.number().int().min(0).max(9) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('play'),
      cardId: z.string().min(1).max(20),
      color: z.enum(['red', 'yellow', 'green', 'blue']).optional(),
      uno: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal('draw') }).strict(),
  z.object({ type: z.literal('pass') }).strict(),
  z.object({ type: z.literal('uno') }).strict(),
  z
    .object({
      type: z.literal('place'),
      x: z.number().int().min(0).max(14),
      y: z.number().int().min(0).max(14),
    })
    .strict(),
  z.object({ type: z.literal('resign') }).strict(),
  z.object({ type: z.literal('undo:request') }).strict(),
  z.object({ type: z.literal('undo:respond'), accept: z.boolean() }).strict(),
]);
async function respond<T>(ack: Ack<T> | undefined, task: () => Promise<T>) {
  if (typeof ack !== 'function') return;
  try {
    ack({ ok: true, data: await task() });
  } catch (e) {
    ack({
      ok: false,
      error: e instanceof z.ZodError ? '请求参数无效' : e instanceof Error ? e.message : '操作失败',
    });
  }
}
export function registerSockets(io: GameServer, rooms: RoomService) {
  io.use(async (socket, next) => {
    try {
      const user = await authenticate(String(socket.handshake.auth.token ?? ''));
      if (!user) return next(new Error('身份无效'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('用户服务不可用'));
    }
  });
  async function broadcastPresence() {
    const sockets = await io.fetchSockets();
    const users = new Map(sockets.map((s) => [s.data.user.id, s.data.user]));
    io.emit('presence:update', [...users.values()]);
  }
  io.on('connection', (socket) => {
    socket.on('system:ping', (ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });
    const user = socket.data.user;
    socket.on('room:current', (ack) => void respond(ack, () => rooms.current(user)));
    void (async () => {
      await socket.join(`user:${user.id}`);
      await rooms.presence(user.id, true);
      socket.emit('lobby:update', await rooms.list());
      await broadcastPresence();
    })().catch((e) => socket.emit('server:error', e instanceof Error ? e.message : '同步失败'));
    socket.on(
      'room:create',
      (payload, ack) =>
        void respond(ack, async () => {
          const data = z
            .object({
              gameId: z.enum([
                'uno',
                'gomoku',
                'xiangqi',
                'doudizhu',
                'holdem',
                'exploding-kittens',
                'mahjong',
                'billiards',
              ]),
              name: z.string().trim().min(1).max(40),
              maxPlayers: z.number().int().min(2).max(6),
              allowAI: z.boolean(),
              allowSpectators: z.boolean(),
              difficulty,
              holdem: z
                .object({
                  startingStack: z.number().int().min(100).max(10000).optional(),
                  smallBlind: z.number().int().min(1).max(5000).optional(),
                  blindEvery: z.number().int().min(1).max(20).optional(),
                  turnSeconds: z.number().int().min(15).max(120).optional(),
                })
                .strict()
                .optional(),
              xiangqi: z
                .object({
                  mode: z.enum(['standard', 'puzzle']).optional(),
                  puzzleId: z.string().min(1).max(40).optional(),
                  turnSeconds: z.number().int().min(15).max(180).optional(),
                  timeoutLoss: z.boolean().optional(),
                })
                .strict()
                .optional(),
              gomoku: z
                .object({
                  blackForbidden: z.boolean().optional(),
                  overlineForbidden: z.boolean().optional(),
                  allowUndo: z.boolean().optional(),
                  allowResign: z.boolean().optional(),
                  timeoutLoss: z.boolean().optional(),
                  turnSeconds: z.number().int().min(15).max(180).optional(),
                })
                .strict()
                .optional(),
            })
            .strict()
            .parse(payload);
          return rooms.create(user, data);
        }),
    );
    socket.on(
      'room:join',
      (payload, ack) =>
        void respond(ack, async () => {
          const p = z
            .object({
              code: z
                .string()
                .trim()
                .min(6)
                .max(6)
                .regex(/^[a-z0-9]+$/i),
              spectate: z.boolean().optional(),
            })
            .parse(payload);
          return rooms.join(user, p.code, p.spectate);
        }),
    );
    socket.on(
      'room:sync',
      (payload, ack) => void respond(ack, async () => rooms.sync(user, room.parse(payload).roomId)),
    );
    socket.on(
      'room:leave',
      (payload, ack) =>
        void respond(ack, async () => {
          await rooms.leave(user, room.parse(payload).roomId);
          return null;
        }),
    );
    socket.on(
      'room:ready',
      (payload, ack) =>
        void respond(ack, async () => {
          const p = room.extend({ ready: z.boolean() }).parse(payload);
          await rooms.ready(user, p.roomId, p.ready);
          return null;
        }),
    );
    socket.on(
      'room:ai',
      (payload, ack) =>
        void respond(ack, async () => {
          const p = room.extend({ difficulty, removeId: id.optional() }).parse(payload);
          await rooms.ai(user, p.roomId, p.difficulty, p.removeId);
          return null;
        }),
    );
    socket.on(
      'room:start',
      (payload, ack) =>
        void respond(ack, async () => {
          await rooms.start(user, room.parse(payload).roomId);
          return null;
        }),
    );
    socket.on(
      'room:rematch',
      (payload, ack) =>
        void respond(ack, async () => {
          await rooms.rematch(user, room.parse(payload).roomId);
          return null;
        }),
    );
    socket.on(
      'game:action',
      (payload, ack) =>
        void respond(ack, async () => {
          const p = room.extend({ action, revision: z.number().int().nonnegative() }).parse(payload);
          await rooms.action(user, p.roomId, p.action, p.revision);
          return null;
        }),
    );
    socket.on(
      'room:chat',
      (payload, ack) =>
        void respond(ack, async () => {
          const p = room.extend({ text: z.string().trim().min(1).max(500) }).parse(payload);
          await rooms.chat(user, p.roomId, p.text);
          return null;
        }),
    );
    socket.on('disconnect', () => {
      void (async () => {
        const other = await io.in(`user:${user.id}`).fetchSockets();
        if (!other.length) await rooms.presence(user.id, false);
        await broadcastPresence();
      })().catch((e) => console.error('Disconnect sync:', e));
    });
  });
  // Reconcile presence after instance restarts, including abrupt process termination.
  let reconciling = false;
  const reconcile = setInterval(() => {
    if (reconciling) return;
    reconciling = true;
    void (async () => {
      const active = new Set((await io.fetchSockets()).map((s) => s.data.user.id));
      const all = await rooms.store.list();
      const needs = new Map<string, boolean>();
      for (const r of all)
        for (const p of r.players.filter((p) => !p.isAI && !p.hasLeft))
          if (p.connected !== active.has(p.id)) needs.set(p.id, active.has(p.id));
      for (const [id, connected] of needs) await rooms.presence(id, connected);
    })()
      .catch((e) => console.error('Presence reconcile:', e))
      .finally(() => {
        reconciling = false;
      });
  }, 5000);
  return () => clearInterval(reconcile);
}
