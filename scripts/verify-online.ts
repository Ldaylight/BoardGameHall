import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import type { ClientEvents, Result, RoomView, ServerEvents, Session, ProfileData } from '../shared/types.js';
import { uno } from '../shared/games/uno/index.js';
const port = 3099;
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
  env: { ...process.env, DEMO_MODE: 'false', PORT: String(port), CLIENT_ORIGIN: 'http://localhost:5173' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (data) => process.stdout.write(data));
server.stderr.on('data', (data) => process.stderr.write(data));
const db = new PrismaClient();
const sockets: Socket<ServerEvents, ClientEvents>[] = [];
const ids: string[] = [];
const roomIds: string[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function api<T>(path: string, method = 'GET', body?: unknown, token?: string): Promise<T> {
  const r = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = (await r.json()) as Result<T>;
  if (!v.ok) throw new Error(v.error);
  return v.data;
}
function request<T>(task: (ack: (r: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ack timeout')), 10000);
    task((r) => {
      clearTimeout(t);
      r.ok ? resolve(r.data) : reject(new Error(r.error));
    });
  });
}
async function connect(s: Session) {
  const socket: Socket<ServerEvents, ClientEvents> = io(base, {
    auth: { token: s.token },
    transports: ['websocket'],
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
try {
  for (let i = 0; i < 80; i++) {
    try {
      await api('/health');
      break;
    } catch {
      if (server.exitCode !== null) throw new Error('online server exited');
      await wait(250);
      if (i === 79) throw new Error('online startup timeout');
    }
  }
  const a = await api<Session>('/session', 'POST', { name: '验收 · 玩家 A' });
  ids.push(a.user.id);
  const b = await api<Session>('/session', 'POST', { name: '验收 · 玩家 B' });
  ids.push(b.user.id);
  const spectator = await api<Session>('/session', 'POST', { name: '验收 · 观战者' });
  ids.push(spectator.user.id);
  let sa = await connect(a);
  const sb = await connect(b);
  const ss = await connect(spectator);
  const r = await request<RoomView>((ack) =>
    sa.emit(
      'room:create',
      {
        gameId: 'uno',
        name: '自动验收房间',
        maxPlayers: 2,
        allowAI: true,
        allowSpectators: true,
        difficulty: 'medium',
      },
      ack,
    ),
  );
  roomIds.push(r.id);
  await request((ack) => sb.emit('room:join', { code: r.code }, ack));
  const denied = await request((ack) => sb.emit('room:start', { roomId: r.id }, ack)).then(
    () => false,
    () => true,
  );
  assert.equal(denied, true);
  await request((ack) => sa.emit('room:chat', { roomId: r.id, text: 'MySQL 中文聊天 ✅' }, ack));
  assert.equal(await db.chatMessage.count({ where: { roomId: r.id } }), 1);
  await api('/friends', 'POST', { userId: b.user.id }, a.token);
  assert.equal((await api<ProfileData>('/profile', 'GET', undefined, a.token)).friends[0].id, b.user.id);
  await request((ack) => sa.emit('room:ready', { roomId: r.id, ready: true }, ack));
  await request((ack) => sb.emit('room:ready', { roomId: r.id, ready: true }, ack));
  await request((ack) => sa.emit('room:start', { roomId: r.id }, ack));
  let view = await request<RoomView>((ack) => sa.emit('room:sync', { roomId: r.id }, ack));
  const before = view.game!.hand;
  const publicView = await request<RoomView>((ack) =>
    ss.emit('room:join', { code: r.code, spectate: true }, ack),
  );
  assert.deepEqual(publicView.game!.hand, []);
  assert.equal('deck' in publicView.game!, false);
  assert.equal('hands' in publicView.game!, false);
  sa.disconnect();
  sa = await connect(a);
  const restored = await request<RoomView>((ack) => sa.emit('room:sync', { roomId: r.id }, ack));
  assert.deepEqual(restored.game!.hand, before);
  let steps = 0;
  while (view.status !== 'finished' && steps++ < 4000) {
    view = await request<RoomView>((ack) => sa.emit('room:sync', { roomId: r.id }, ack));
    if (view.status === 'finished') break;
    const current = view.game!.currentPlayerId;
    const active = current === a.user.id ? sa : sb;
    const privateView =
      current === a.user.id
        ? view
        : await request<RoomView>((ack) => sb.emit('room:sync', { roomId: r.id }, ack));
    assert.equal(await db.match.count({ where: { roomId: r.id } }), 0);
    const action = uno.aiMove(privateView.game!, current, 'medium');
    await request((ack) =>
      active.emit('game:action', { roomId: r.id, revision: privateView.revision, action }, ack),
    );
  }
  assert.equal(view.status, 'finished');
  assert.equal(view.resultSaved, true);
  assert.equal(await db.match.count({ where: { roomId: r.id } }), 1);
  assert.equal(await db.matchPlayer.count({ where: { matchId: view.matchId! } }), 2);
  const pa = await api<ProfileData>('/profile', 'GET', undefined, a.token);
  assert.equal(pa.matches.length, 1);
  assert.equal(pa.user.coins, view.game!.winnerId === a.user.id ? 1100 : 1010);
  const duplicates = await request((ack) =>
    sa.emit('game:action', { roomId: r.id, revision: view.revision, action: { type: 'draw' } }, ack),
  ).then(
    () => false,
    () => true,
  );
  assert.equal(duplicates, true);
  const winnerSocket = view.hostId === a.user.id ? sa : sb;
  await request((ack) => winnerSocket.emit('room:rematch', { roomId: r.id }, ack));
  assert.equal(
    (await request<RoomView>((ack) => sa.emit('room:sync', { roomId: r.id }, ack))).status,
    'waiting',
  );
  console.log(
    `PASS: MySQL lifecycle, transactions, Unicode chat, friendship, 2-human complete match (${steps} actions), private spectator view, reconnect, exactly-once rewards and rematch.`,
  );
} finally {
  sockets.forEach((s) => s.disconnect());
  server.kill();
  await wait(300);
  // Delete only UUID fixtures created by this invocation; never reset a database or touch preexisting data.
  await db.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { roomId: { in: roomIds } } });
    await tx.room.deleteMany({ where: { id: { in: roomIds } } });
    await tx.user.deleteMany({ where: { id: { in: ids } } });
  });
  await db.$disconnect();
}
