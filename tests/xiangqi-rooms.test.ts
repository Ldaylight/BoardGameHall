import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../server/src/services/store';
import { RoomService, type GameServer } from '../server/src/services/rooms';
import type { RoomOptions, User } from '../shared/types';
import { xiangqiView } from '../shared/games/views';
const options: RoomOptions = {
  gameId: 'xiangqi',
  name: '象棋测试',
  maxPlayers: 2,
  allowAI: true,
  allowSpectators: true,
  difficulty: 'hard',
};
const user = (): User => ({ id: randomUUID(), name: '棋友', avatar: 'leaf', coins: 1000, level: 1 });
const setup = () =>
  new RoomService(new MemoryStore(), {
    emit: vi.fn(),
    to: () => ({ emit: vi.fn() }),
  } as unknown as GameServer);
describe('Xiangqi reuses the room service', () => {
  it('enforces two seats, known puzzles, authority, revision and reconnect', async () => {
    const rooms = setup(),
      a = user(),
      b = user();
    await expect(rooms.create(a, { ...options, maxPlayers: 3 })).rejects.toThrow('2 人');
    await expect(
      rooms.create(a, { ...options, xiangqi: { mode: 'puzzle', puzzleId: 'unknown' } }),
    ).rejects.toThrow('残局');
    const r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    await rooms.ready(a, r.id, true);
    await rooms.ready(b, r.id, true);
    await rooms.start(a, r.id);
    const v = await rooms.sync(a, r.id),
      action = { type: 'move' as const, from: { x: 1, y: 7 }, to: { x: 1, y: 0 } };
    await expect(rooms.action(b, r.id, action, v.revision)).rejects.toThrow('轮到');
    await rooms.action(a, r.id, action, v.revision);
    await expect(rooms.action(a, r.id, action, v.revision)).rejects.toThrow('状态');
    const s = user(),
      watch = await rooms.join(s, r.code, true);
    await expect(rooms.action(s, r.id, action, watch.revision)).rejects.toThrow('观战');
    const before = xiangqiView(await rooms.sync(a, r.id));
    await rooms.presence(a.id, false);
    await rooms.presence(a.id, true);
    expect(xiangqiView(await rooms.sync(a, r.id))).toEqual(before);
  });
  it('hard AI waits 500–1500ms, runs in a worker and applies the standard action', async () => {
    const rooms = setup(),
      a = user();
    const r = await rooms.create(a, options);
    await rooms.ai(a, r.id, 'hard');
    await rooms.ready(a, r.id, true);
    await rooms.start(a, r.id);
    let v = await rooms.sync(a, r.id);
    await rooms.action(a, r.id, { type: 'move', from: { x: 0, y: 6 }, to: { x: 0, y: 5 } }, v.revision);
    const s = (await rooms.store.get(r.id))!;
    expect(s.nextActionAt! - Date.now()).toBeGreaterThanOrEqual(450);
    expect(s.nextActionAt! - Date.now()).toBeLessThanOrEqual(1500);
    await rooms.tick();
    expect(xiangqiView(await rooms.sync(a, r.id)).turnNumber).toBe(1);
    s.nextActionAt = Date.now() - 1;
    await rooms.store.put(s);
    await rooms.tick();
    v = await rooms.sync(a, r.id);
    expect(xiangqiView(v).turnNumber).toBe(2);
    expect(v.revision).toBe(s.revision + 1);
  }, 15000);
  it('mates in a puzzle, persists the result and restores the puzzle on rematch', async () => {
    const rooms = setup(),
      a = user();
    const r = await rooms.create(a, { ...options, xiangqi: { mode: 'puzzle', puzzleId: 'double-cannon' } });
    await rooms.ai(a, r.id, 'hard');
    await rooms.ready(a, r.id, true);
    await rooms.start(a, r.id);
    const v = await rooms.sync(a, r.id);
    await rooms.action(a, r.id, { type: 'move', from: { x: 3, y: 2 }, to: { x: 4, y: 2 } }, v.revision);
    const end = await rooms.sync(a, r.id);
    expect(end.status).toBe('finished');
    expect(end.resultSaved).toBe(true);
    expect(xiangqiView(end).endReason).toBe('checkmate');
    await rooms.rematch(a, r.id);
    await rooms.ready(a, r.id, true);
    await rooms.start(a, r.id);
    expect(xiangqiView(await rooms.sync(a, r.id)).options.puzzleId).toBe('double-cannon');
  });
});
