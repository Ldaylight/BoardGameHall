import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import { PrismaClient } from '@prisma/client';
import type { ClientEvents, Result, RoomView, ServerEvents, Session, ProfileData } from '../shared/types.js';
import { uno } from '../shared/games/uno/index.js';
import { unoView, xiangqiView, doudizhuView, kittensView } from '../shared/games/views.js';
import { doudizhu } from '../shared/games/doudizhu/index.js';
import { kittens } from '../shared/games/exploding-kittens/index.js';
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
  const before = unoView(view).hand;
  const publicView = await request<RoomView>((ack) =>
    ss.emit('room:join', { code: r.code, spectate: true }, ack),
  );
  assert.deepEqual(unoView(publicView).hand, []);
  assert.equal('deck' in publicView.game!, false);
  assert.equal('hands' in publicView.game!, false);
  sa.disconnect();
  sa = await connect(a);
  const restored = await request<RoomView>((ack) => sa.emit('room:sync', { roomId: r.id }, ack));
  assert.deepEqual(unoView(restored).hand, before);
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
    const action = uno.aiMove(unoView(privateView), current, 'medium');
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
  await request((ack) => sa.emit('room:leave', { roomId: r.id }, ack));
  await request((ack) => sb.emit('room:leave', { roomId: r.id }, ack));
  const gr = await request<RoomView>((ack) =>
    sa.emit(
      'room:create',
      {
        gameId: 'gomoku',
        name: 'MySQL 五子棋验收',
        maxPlayers: 2,
        allowAI: true,
        allowSpectators: true,
        difficulty: 'hard',
        gomoku: { allowUndo: true },
      },
      ack,
    ),
  );
  roomIds.push(gr.id);
  await request((ack) => sb.emit('room:join', { code: gr.code }, ack));
  const beginGomoku = async () => {
    await request((ack) => sa.emit('room:ready', { roomId: gr.id, ready: true }, ack));
    await request((ack) => sb.emit('room:ready', { roomId: gr.id, ready: true }, ack));
    await request((ack) => sa.emit('room:start', { roomId: gr.id }, ack));
  };
  const syncGomoku = () => request<RoomView>((ack) => sa.emit('room:sync', { roomId: gr.id }, ack));
  const gomokuAction = async (
    socket: Socket<ServerEvents, ClientEvents>,
    action: import('../shared/games/gomoku/types.js').GomokuAction,
  ) => {
    const view = await syncGomoku();
    await request((ack) =>
      socket.emit('game:action', { roomId: gr.id, revision: view.revision, action }, ack),
    );
  };
  await beginGomoku();
  await request((ack) => sa.emit('room:chat', { roomId: gr.id, text: '五子棋持久化验收 ♟' }, ack));
  for (let i = 0; i < 5; i++) {
    await gomokuAction(sa, { type: 'place', x: i + 4, y: 7 });
    if (i < 4) await gomokuAction(sb, { type: 'place', x: i + 1, y: 3 });
  }
  const gWon = await syncGomoku();
  assert.equal(gWon.status, 'finished');
  assert.equal(gWon.resultSaved, true);
  const record = await db.match.findUniqueOrThrow({
    where: { id: gWon.matchId! },
    include: { players: true },
  });
  assert.equal(record.gameId, 'gomoku');
  assert.equal(record.winnerId, a.user.id);
  assert.equal(record.players.length, 2);
  assert.equal((record.publicResult as { moves: unknown[] }).moves.length, 9);
  assert.equal(
    (
      await db.ranking.findUniqueOrThrow({
        where: { userId_gameId: { userId: a.user.id, gameId: 'gomoku' } },
      })
    ).wins,
    1,
  );
  await request((ack) => sa.emit('room:rematch', { roomId: gr.id }, ack));
  await beginGomoku();
  // This two-row alternating pattern contains no five in any direction, including diagonals.
  const cells = [[], []] as { x: number; y: number }[][];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) cells[(x + Math.floor(y / 2)) % 2].push({ x, y });
  for (let i = 0; i < 225; i++) {
    const color = i % 2,
      point = cells[color].shift()!;
    await gomokuAction(color === 0 ? sa : sb, { type: 'place', ...point });
    if (i === 110) assert.equal(await db.match.count({ where: { roomId: gr.id } }), 1);
  }
  const gDraw = await syncGomoku();
  assert.equal(gDraw.status, 'finished');
  assert.equal(gDraw.resultSaved, true);
  const drawRecord = await db.match.findUniqueOrThrow({
    where: { id: gDraw.matchId! },
    include: { players: true },
  });
  assert.equal(drawRecord.winnerId, null);
  assert.equal(
    drawRecord.players.every((p) => !p.won && p.coinsDelta === 10),
    true,
  );
  assert.equal((drawRecord.publicResult as { draw: boolean; moves: unknown[] }).draw, true);
  assert.equal((drawRecord.publicResult as { moves: unknown[] }).moves.length, 225);
  await syncGomoku();
  await syncGomoku();
  assert.equal(await db.match.count({ where: { roomId: gr.id } }), 2);
  assert.equal(
    (
      await db.ranking.findUniqueOrThrow({
        where: { userId_gameId: { userId: a.user.id, gameId: 'gomoku' } },
      })
    ).played,
    2,
  );
  const gProfile = await api<ProfileData>('/profile', 'GET', undefined, a.token);
  assert.equal(gProfile.matches.filter((m) => m.gameName === '五子棋').length, 2);
  assert.equal(gProfile.rankings.find((ranking) => ranking.user.id === a.user.id)!.played, 3);
  await request((ack) => sa.emit('room:rematch', { roomId: gr.id }, ack));
  console.log(
    'PASS: Gomoku MySQL win + 225-move draw, nullable winner, complete public replay, per-game ranking, combined profile, exactly-once rewards, rematch.',
  );
  await request((ack) => sa.emit('room:leave', { roomId: gr.id }, ack));
  await request((ack) => sb.emit('room:leave', { roomId: gr.id }, ack));
  const xr = await request<RoomView>((ack) =>
    sa.emit(
      'room:create',
      {
        gameId: 'xiangqi',
        name: 'MySQL 象棋验收',
        maxPlayers: 2,
        allowAI: true,
        allowSpectators: true,
        difficulty: 'hard',
      },
      ack,
    ),
  );
  roomIds.push(xr.id);
  await request((ack) => sb.emit('room:join', { code: xr.code }, ack));
  await request((ack) => sa.emit('room:ready', { roomId: xr.id, ready: true }, ack));
  await request((ack) => sb.emit('room:ready', { roomId: xr.id, ready: true }, ack));
  await request((ack) => sa.emit('room:start', { roomId: xr.id }, ack));
  const syncX = () => request<RoomView>((ack) => sa.emit('room:sync', { roomId: xr.id }, ack));
  let xv = await syncX();
  await request((ack) =>
    sa.emit(
      'game:action',
      {
        roomId: xr.id,
        revision: xv.revision,
        action: { type: 'move', from: { x: 1, y: 7 }, to: { x: 1, y: 0 } },
      },
      ack,
    ),
  );
  xv = await syncX();
  assert.equal(xiangqiView(xv).captured[0].kind, 'horse');
  assert.equal(await db.match.count({ where: { roomId: xr.id } }), 0);
  await request((ack) => sb.emit('room:chat', { roomId: xr.id, text: '象棋炮击吃马 ♟' }, ack));
  xv = await syncX();
  await request((ack) =>
    sb.emit('game:action', { roomId: xr.id, revision: xv.revision, action: { type: 'resign' } }, ack),
  );
  xv = await syncX();
  assert.equal(xv.resultSaved, true);
  const xrecord = await db.match.findUniqueOrThrow({
    where: { id: xv.matchId! },
    include: { players: true },
  });
  assert.equal(xrecord.gameId, 'xiangqi');
  assert.equal(xrecord.winnerId, a.user.id);
  assert.equal(
    (xrecord.publicResult as { moves: { captured: { kind: string } }[] }).moves[0].captured.kind,
    'horse',
  );
  assert.equal(xrecord.players.find((p) => p.playerId === a.user.id)!.coinsDelta, 100);
  await syncX();
  assert.equal(await db.match.count({ where: { roomId: xr.id } }), 1);
  assert.equal(
    (
      await db.ranking.findUniqueOrThrow({
        where: { userId_gameId: { userId: a.user.id, gameId: 'xiangqi' } },
      })
    ).wins,
    1,
  );
  const beforePuzzle = await api<ProfileData>('/profile', 'GET', undefined, a.token);
  const puzzle = await request<RoomView>((ack) =>
    sa.emit(
      'room:create',
      {
        gameId: 'xiangqi',
        name: 'MySQL 重炮残局',
        maxPlayers: 2,
        allowAI: true,
        allowSpectators: true,
        difficulty: 'hard',
        xiangqi: { mode: 'puzzle', puzzleId: 'double-cannon' },
      },
      ack,
    ),
  );
  roomIds.push(puzzle.id);
  await request((ack) => sa.emit('room:ai', { roomId: puzzle.id, difficulty: 'hard' }, ack));
  await request((ack) => sa.emit('room:ready', { roomId: puzzle.id, ready: true }, ack));
  await request((ack) => sa.emit('room:start', { roomId: puzzle.id }, ack));
  const pv = await request<RoomView>((ack) => sa.emit('room:sync', { roomId: puzzle.id }, ack));
  await request((ack) =>
    sa.emit(
      'game:action',
      {
        roomId: puzzle.id,
        revision: pv.revision,
        action: { type: 'move', from: { x: 3, y: 2 }, to: { x: 4, y: 2 } },
      },
      ack,
    ),
  );
  const pend = await request<RoomView>((ack) => sa.emit('room:sync', { roomId: puzzle.id }, ack));
  assert.equal(pend.resultSaved, true);
  const pr = await db.match.findUniqueOrThrow({ where: { id: pend.matchId! }, include: { players: true } });
  assert.equal((pr.publicResult as { reason: string }).reason, 'checkmate');
  assert.equal(
    pr.players.every((p) => p.coinsDelta === 0 && p.score === 0),
    true,
  );
  const afterPuzzle = await api<ProfileData>('/profile', 'GET', undefined, a.token);
  assert.equal(afterPuzzle.user.coins, beforePuzzle.user.coins);
  assert.equal(afterPuzzle.user.level, beforePuzzle.user.level);
  assert.equal(afterPuzzle.matches.filter((m) => m.gameName === '中国象棋').length, 2);
  assert.equal(afterPuzzle.matches.find((m) => m.id === pend.matchId)?.training, true);
  assert.deepEqual(afterPuzzle.rankings, beforePuzzle.rankings);
  const ddzUsers = [a, b, spectator],
    ddzSockets = [sa, sb, ss];
  const beforeDdz = await Promise.all(
    ddzUsers.map((u) => api<ProfileData>('/profile', 'GET', undefined, u.token)),
  );
  const dr = await request<RoomView>((ack) =>
    sa.emit(
      'room:create',
      {
        gameId: 'doudizhu',
        name: 'MySQL 斗地主三人联机',
        maxPlayers: 3,
        allowAI: true,
        allowSpectators: true,
        difficulty: 'medium',
      },
      ack,
    ),
  );
  roomIds.push(dr.id);
  await request((ack) => sb.emit('room:join', { code: dr.code }, ack));
  await request((ack) => ss.emit('room:join', { code: dr.code }, ack));
  for (const s of ddzSockets)
    await request((ack) => s.emit('room:ready', { roomId: dr.id, ready: true }, ack));
  await request((ack) => sa.emit('room:start', { roomId: dr.id }, ack));
  const syncD = (i = 0) =>
    request<RoomView>((ack) => ddzSockets[i].emit('room:sync', { roomId: dr.id }, ack));
  let dv = await syncD();
  assert.equal(doudizhuView(dv).kitty.length, 0);
  assert.equal('hands' in doudizhuView(dv), false);
  await request((ack) => sa.emit('room:chat', { roomId: dr.id, text: '斗地主农民组队 🃏' }, ack));
  dv = await syncD();
  const handD = doudizhuView(dv).hand;
  sa.disconnect();
  sa = await connect(a);
  ddzSockets[0] = sa;
  assert.deepEqual(doudizhuView(await syncD()).hand, handD);
  let dSteps = 0;
  while (dSteps++ < 300) {
    dv = await syncD();
    const g = doudizhuView(dv);
    if (g.phase === 'finished') break;
    const actor = ddzUsers.findIndex((u) => u.user.id === g.currentPlayerId),
      own = await syncD(actor);
    assert.equal(await db.match.count({ where: { roomId: dr.id } }), 0);
    const action = doudizhu.aiMove(doudizhuView(own), g.currentPlayerId, 'medium');
    await request((ack) =>
      ddzSockets[actor].emit('game:action', { roomId: dr.id, revision: own.revision, action }, ack),
    );
  }
  dv = await syncD();
  const dg = doudizhuView(dv);
  assert.equal(dg.phase, 'finished');
  assert.equal(dv.resultSaved, true);
  const dRecord = await db.match.findUniqueOrThrow({
    where: { id: dv.matchId! },
    include: { players: true },
  });
  const dResult = dRecord.publicResult as {
    winnerIds: string[];
    winningTeam: string;
    scores: Record<string, number>;
    moves: unknown[];
  };
  assert.deepEqual(dResult.winnerIds, dg.winnerIds);
  assert.equal(dResult.winnerIds.length, dg.winningTeam === 'farmers' ? 2 : 1);
  assert.equal(
    Object.values(dResult.scores).reduce((a, b) => a + b, 0),
    0,
  );
  assert.equal(dResult.moves.length, dg.moves.length);
  for (let i = 0; i < ddzUsers.length; i++) {
    const uid = ddzUsers[i].user.id,
      won = dg.winnerIds.includes(uid),
      p = dRecord.players.find((p) => p.playerId === uid)!;
    assert.equal(p.won, won);
    assert.equal(p.score, won ? 30 : 5);
    assert.equal(p.coinsDelta, won ? 100 : 10);
    const current = await api<ProfileData>('/profile', 'GET', undefined, ddzUsers[i].token);
    assert.equal(current.user.coins, beforeDdz[i].user.coins + (won ? 100 : 10));
    assert.equal(current.matches.find((m) => m.id === dv.matchId)?.gameName, '斗地主');
    const ranking = await db.ranking.findUniqueOrThrow({
      where: { userId_gameId: { userId: uid, gameId: 'doudizhu' } },
    });
    assert.equal(ranking.played, 1);
    assert.equal(ranking.wins, won ? 1 : 0);
  }
  await syncD();
  assert.equal(await db.match.count({ where: { roomId: dr.id } }), 1);
  assert.equal(await db.chatMessage.count({ where: { roomId: dr.id } }), 1);
  await request((ack) => sa.emit('room:rematch', { roomId: dr.id }, ack));
  assert.equal((await syncD()).game, null);
  // A second real game specifically exercises two-farmer settlement in the SQL transaction.
  const beforeFarmers = await Promise.all(
    ddzUsers.map((u) => api<ProfileData>('/profile', 'GET', undefined, u.token)),
  );
  const previousRanks = await Promise.all(
    ddzUsers.map((u) =>
      db.ranking.findUniqueOrThrow({ where: { userId_gameId: { userId: u.user.id, gameId: 'doudizhu' } } }),
    ),
  );
  for (const s of ddzSockets)
    await request((ack) => s.emit('room:ready', { roomId: dr.id, ready: true }, ack));
  await request((ack) => sa.emit('room:start', { roomId: dr.id }, ack));
  const dealt = await Promise.all(ddzSockets.map((_, i) => syncD(i)));
  const weakIndex = dealt
    .map((r, i) => ({ i, max: Math.max(...doudizhuView(r).hand.map((c) => c.rank)) }))
    .sort((a, b) => a.max - b.max)[0].i;
  const weakId = ddzUsers[weakIndex].user.id;
  let farmSteps = 0;
  while (farmSteps++ < 300) {
    const r = await syncD(),
      g = doudizhuView(r);
    if (g.phase === 'finished') break;
    const actor = ddzUsers.findIndex((u) => u.user.id === g.currentPlayerId),
      own = await syncD(actor),
      v = doudizhuView(own);
    const action: import('../shared/games/doudizhu/types.js').DoudizhuAction =
      v.phase === 'bidding'
        ? { type: 'bid', value: g.currentPlayerId === weakId ? 3 : 0 }
        : g.currentPlayerId === weakId
          ? v.trick
            ? { type: 'pass' }
            : { type: 'play', cardIds: [v.hand.at(-1)!.id] }
          : doudizhu.aiMove(v, g.currentPlayerId, 'medium');
    assert.equal(await db.match.count({ where: { roomId: dr.id } }), 1);
    await request((ack) =>
      ddzSockets[actor].emit('game:action', { roomId: dr.id, revision: own.revision, action }, ack),
    );
  }
  const farmRoom = await syncD(),
    farmGame = doudizhuView(farmRoom);
  assert.equal(farmGame.winningTeam, 'farmers');
  assert.equal(farmGame.winnerIds.length, 2);
  assert.equal(farmRoom.resultSaved, true);
  const farmRecord = await db.match.findUniqueOrThrow({
    where: { id: farmRoom.matchId! },
    include: { players: true },
  });
  for (let i = 0; i < ddzUsers.length; i++) {
    const uid = ddzUsers[i].user.id,
      won = uid !== weakId,
      p = farmRecord.players.find((p) => p.playerId === uid)!;
    assert.equal(p.won, won);
    assert.equal(p.coinsDelta, won ? 100 : 10);
    assert.equal(p.score, won ? 30 : 5);
    const current = await api<ProfileData>('/profile', 'GET', undefined, ddzUsers[i].token);
    assert.equal(current.user.coins, beforeFarmers[i].user.coins + (won ? 100 : 10));
    const ranking = await db.ranking.findUniqueOrThrow({
      where: { userId_gameId: { userId: uid, gameId: 'doudizhu' } },
    });
    assert.equal(ranking.played, 2);
    assert.equal(ranking.wins, previousRanks[i].wins + (won ? 1 : 0));
  }
  await syncD();
  assert.equal(await db.match.count({ where: { roomId: dr.id } }), 2);
  await request((ack) => sa.emit('room:rematch', { roomId: dr.id }, ack));
  console.log(
    `PASS: Doudizhu farmer-team MySQL rematch (${farmSteps} actions), both farmers won/rewarded/ranked, cumulative exactly-once records.`,
  );
  const beforeKittens = await Promise.all(
    ddzUsers.map((u) => api<ProfileData>('/profile', 'GET', undefined, u.token)),
  );
  for (const s of ddzSockets) await request((ack) => s.emit('room:leave', { roomId: dr.id }, ack));
  const kr = await request<RoomView>((ack) =>
    sa.emit(
      'room:create',
      {
        gameId: 'exploding-kittens',
        name: 'MySQL 炸弹猫验收',
        maxPlayers: 3,
        allowAI: true,
        allowSpectators: true,
        difficulty: 'medium',
      },
      ack,
    ),
  );
  roomIds.push(kr.id);
  await request((ack) => sb.emit('room:join', { code: kr.code }, ack));
  await request((ack) => ss.emit('room:join', { code: kr.code }, ack));
  for (const s of ddzSockets)
    await request((ack) => s.emit('room:ready', { roomId: kr.id, ready: true }, ack));
  await request((ack) => sa.emit('room:start', { roomId: kr.id }, ack));
  const syncK = (i = 0) =>
    request<RoomView>((ack) => ddzSockets[i].emit('room:sync', { roomId: kr.id }, ack));
  const beforeHand = kittensView(await syncK()).hand;
  sa.disconnect();
  sa = await connect(a);
  ddzSockets[0] = sa;
  assert.deepEqual(kittensView(await syncK()).hand, beforeHand);
  await request((ack) => sa.emit('room:chat', { roomId: kr.id, text: '秘密拆弹，喵！🐈' }, ack));
  let kSteps = 0;
  while (kSteps++ < 600) {
    const r = await syncK(),
      g = kittensView(r);
    if (g.phase === 'finished') break;
    assert.equal('hands' in g || 'deck' in g || 'eliminatedHands' in g, false);
    assert.equal(await db.match.count({ where: { roomId: kr.id } }), 0);
    const actor = ddzUsers.findIndex((u) =>
      g.phase === 'reaction'
        ? g.alive.includes(u.user.id) && !g.pending!.allowed.includes(u.user.id)
        : u.user.id === g.actorId,
    );
    const own = kittensView(await syncK(actor));
    const action =
      g.phase === 'reaction'
        ? { type: 'ek:allow' as const, pendingId: g.pending!.id }
        : kittens.aiMove(own, ddzUsers[actor].user.id, 'medium');
    await request((ack) =>
      ddzSockets[actor].emit('game:action', { roomId: kr.id, revision: r.revision, action }, ack),
    );
  }
  const kEnded = await syncK(),
    kg = kittensView(kEnded);
  assert.equal(kg.phase, 'finished');
  assert.equal(kEnded.resultSaved, true);
  const kRecord = await db.match.findUniqueOrThrow({
    where: { id: kEnded.matchId! },
    include: { players: true },
  });
  assert.equal(kRecord.gameId, 'exploding-kittens');
  assert.equal(kRecord.winnerId, kg.winnerId);
  assert.equal(kRecord.players.length, 3);
  assert.equal(kRecord.players.filter((p) => p.won).length, 1);
  const kReplay = kRecord.publicResult as Record<string, unknown>;
  for (const forbidden of ['hands', 'deck', 'eliminatedHands', 'future', 'bomb', 'index'])
    assert.equal(forbidden in kReplay, false);
  for (let i = 0; i < ddzUsers.length; i++) {
    const uid = ddzUsers[i].user.id,
      won = kg.winnerId === uid;
    const p = kRecord.players.find((p) => p.playerId === uid)!;
    assert.equal(p.won, won);
    assert.equal(p.coinsDelta, won ? 100 : 10);
    const profile = await api<ProfileData>('/profile', 'GET', undefined, ddzUsers[i].token);
    assert.equal(profile.user.coins, beforeKittens[i].user.coins + (won ? 100 : 10));
    assert.equal(profile.matches.find((m) => m.id === kEnded.matchId)?.gameName, '炸弹猫');
    const ranking = await db.ranking.findUniqueOrThrow({
      where: { userId_gameId: { userId: uid, gameId: 'exploding-kittens' } },
    });
    assert.equal(ranking.played, 1);
    assert.equal(ranking.wins, won ? 1 : 0);
  }
  await syncK();
  await syncK();
  assert.equal(await db.match.count({ where: { roomId: kr.id } }), 1);
  assert.equal(await db.chatMessage.count({ where: { roomId: kr.id } }), 1);
  await request((ack) => sa.emit('room:rematch', { roomId: kr.id }, ack));
  assert.equal((await syncK()).game, null);
  console.log(
    `PASS: Kittens MySQL 3-human game (${kSteps} actions), private reconnect, Unicode chat, public-only replay, eliminated-player records, exactly-once rewards/ranking and rematch.`,
  );
  console.log(
    `PASS: Doudizhu 3-human MySQL game (${dSteps} actions), bidding/private hand/reconnect, team ${dg.winningTeam}, public replay/scores, all 3 MatchPlayers, exactly-once rankings and rewards, rematch.`,
  );
  console.log(
    'PASS: Xiangqi MySQL capture replay, resignation, Unicode chat, exactly-once ranking/rewards; endgame checkmate persisted with zero practice rewards.',
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
