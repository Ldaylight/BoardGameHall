import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../server/src/services/store';
import { RoomService, type GameServer } from '../server/src/services/rooms';
import type { RoomOptions, User } from '../shared/types';
import { isGomoku } from '../shared/games';
const options: RoomOptions = {
  gameId: 'gomoku',
  name: '五子棋测试',
  maxPlayers: 2,
  allowAI: true,
  allowSpectators: true,
  difficulty: 'medium',
};
const user = (): User => ({ id: randomUUID(), name: '棋友', avatar: 'leaf', coins: 1000, level: 1 });
const setup = () =>
  new RoomService(new MemoryStore(), {
    emit: vi.fn(),
    to: () => ({ emit: vi.fn() }),
  } as unknown as GameServer);
describe('gomoku uses existing room authority', () => {
  it('creates, starts, rejects races/wrong turns/spectators and restores the exact public board', async () => {
    const rooms = setup(),
      a = user(),
      b = user();
    await expect(rooms.create(a, { ...options, maxPlayers: 3 })).rejects.toThrow('2 人');
    const r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    await rooms.ready(a, r.id, true);
    await rooms.ready(b, r.id, true);
    await rooms.start(a, r.id);
    const v = await rooms.sync(a, r.id);
    await expect(rooms.action(b, r.id, { type: 'place', x: 7, y: 7 }, v.revision)).rejects.toThrow('轮到');
    const race = await Promise.allSettled([
      rooms.action(a, r.id, { type: 'place', x: 7, y: 7 }, v.revision),
      rooms.action(a, r.id, { type: 'place', x: 8, y: 7 }, v.revision),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const s = user(),
      watched = await rooms.join(s, r.code, true);
    await expect(rooms.action(s, r.id, { type: 'place', x: 0, y: 0 }, watched.revision)).rejects.toThrow(
      '观战',
    );
    await rooms.presence(a.id, false);
    await rooms.presence(a.id, true);
    const restored = await rooms.sync(a, r.id);
    expect(restored.game && 'board' in restored.game && restored.game.board[7][7]).toBe(1);
    expect(await rooms.current(a)).toMatchObject({ id: r.id });
  });
  it('AI delay is 500–1500ms, and a worker action uses the same revision path', async () => {
    const rooms = setup(),
      a = user();
    const r = await rooms.create(a, options);
    await rooms.ai(a, r.id, 'hard');
    await rooms.ready(a, r.id, true);
    await rooms.start(a, r.id);
    const v = await rooms.sync(a, r.id);
    await rooms.action(a, r.id, { type: 'place', x: 7, y: 7 }, v.revision);
    const stored = (await rooms.store.get(r.id))!;
    expect(stored.nextActionAt! - Date.now()).toBeGreaterThanOrEqual(450);
    expect(stored.nextActionAt! - Date.now()).toBeLessThanOrEqual(1500);
    await rooms.tick();
    expect((await rooms.store.get(r.id))!.game!.turnNumber).toBe(1);
    stored.nextActionAt = Date.now() - 1;
    await rooms.store.put(stored);
    await rooms.tick();
    const after = (await rooms.store.get(r.id))!;
    expect(after.game!.turnNumber).toBe(2);
    expect(after.revision).toBe(stored.revision + 1);
    expect(after.game && isGomoku(after.game) && after.game.board.flat().filter(Boolean)).toHaveLength(2);
  }, 15_000);
  it('full-board draws save results and can rematch; timeout-loss does not use AI takeover', async () => {
    const rooms = setup(),
      a = user(),
      b = user();
    const r = await rooms.create(a, { ...options, gomoku: { timeoutLoss: true } });
    await rooms.join(b, r.code);
    await rooms.ready(a, r.id, true);
    await rooms.ready(b, r.id, true);
    await rooms.start(a, r.id);
    await rooms.presence(a.id, false);
    let stored = (await rooms.store.get(r.id))!;
    expect(stored.nextActionAt).toBeNull();
    stored.game!.turnDeadline = Date.now() - 1;
    await rooms.store.put(stored);
    await rooms.tick();
    stored = (await rooms.store.get(r.id))!;
    expect(stored.status).toBe('finished');
    expect(stored.game!.winnerId).toBe(b.id);
    expect(stored.resultSaved).toBe(true);
    await rooms.rematch(a, r.id);
    expect((await rooms.sync(a, r.id)).status).toBe('waiting');
    await rooms.ready(a, r.id, true);
    await rooms.ready(b, r.id, true);
    await rooms.start(a, r.id);
    stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isGomoku(stored.game)) throw new Error('wrong game');
    for (let y = 0; y < 15; y++)
      for (let x = 0; x < 15; x++) {
        const stone = (((x + Math.floor(y / 2)) % 2) + 1) as 1 | 2;
        stored.game.board[y][x] = stone;
        stored.game.moves.push({ x, y, stone, playerId: stored.game.players[stone - 1] });
      }
    stored.game.board[0][0] = 0;
    stored.game.moves.shift();
    await rooms.store.put(stored);
    await rooms.action(a, r.id, { type: 'place', x: 0, y: 0 }, stored.revision);
    const ended = (await rooms.store.get(r.id))!;
    expect(ended.resultSaved).toBe(true);
    expect(ended.status).toBe('finished');
    expect(ended.game!.winnerId).toBeNull();
    await rooms.rematch(a, r.id);
    expect((await rooms.sync(a, r.id)).game).toBeNull();
  });
});
