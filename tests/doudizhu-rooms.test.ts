import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../server/src/services/store';
import { RoomService, type GameServer } from '../server/src/services/rooms';
import { session, profile } from '../server/src/services/database';
import { isDoudizhu } from '../shared/games';
import { doudizhuView } from '../shared/games/views';
import type { RoomOptions, User } from '../shared/types';
const options: RoomOptions = {
  gameId: 'doudizhu',
  name: '斗地主测试',
  maxPlayers: 3,
  allowAI: true,
  allowSpectators: true,
  difficulty: 'medium',
};
const user = (): User => ({ id: randomUUID(), name: '牌友', avatar: 'leaf', coins: 1000, level: 1 });
const setup = () =>
  new RoomService(new MemoryStore(), {
    emit: vi.fn(),
    to: () => ({ emit: vi.fn() }),
  } as unknown as GameServer);
describe('Doudizhu shares existing rooms', () => {
  it('requires three seats, prepares/chats, rejects races/wrong actors/spectators and restores private views', async () => {
    const rooms = setup(),
      a = user(),
      b = user(),
      c = user(),
      s = user();
    await expect(rooms.create(a, { ...options, maxPlayers: 2 })).rejects.toThrow('3 人');
    const r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    await rooms.ready(a, r.id, true);
    await rooms.ready(b, r.id, true);
    await expect(rooms.start(a, r.id)).rejects.toThrow('3 位');
    await rooms.join(c, r.code);
    await rooms.ready(c, r.id, true);
    await rooms.start(a, r.id);
    const stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isDoudizhu(stored.game)) throw new Error('wrong game');
    stored.game.currentIndex = 0;
    await rooms.store.put(stored);
    let v = await rooms.sync(a, r.id);
    await expect(rooms.action(b, r.id, { type: 'bid', value: 3 }, v.revision)).rejects.toThrow('轮到');
    const race = await Promise.allSettled([
      rooms.action(a, r.id, { type: 'bid', value: 3 }, v.revision),
      rooms.action(a, r.id, { type: 'bid', value: 3 }, v.revision),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const spectator = await rooms.join(s, r.code, true);
    expect(doudizhuView(spectator).hand).toEqual([]);
    expect(doudizhuView(spectator).revealedHands).toBeNull();
    expect(doudizhuView(spectator)).not.toHaveProperty('hands');
    await expect(rooms.action(s, r.id, { type: 'pass' }, spectator.revision)).rejects.toThrow('观战');
    v = await rooms.sync(a, r.id);
    const hand = doudizhuView(v).hand;
    await rooms.presence(a.id, false);
    await rooms.presence(a.id, true);
    expect(doudizhuView(await rooms.sync(a, r.id)).hand).toEqual(hand);
    await rooms.chat(a, r.id, '农民一起加油');
    expect((await rooms.sync(b, r.id)).chats.at(-1)?.text).toBe('农民一起加油');
    expect((await rooms.current(a))?.id).toBe(r.id);
  });
  it('AI thinks before moving and worker actions use standard revisions', async () => {
    const rooms = setup(),
      a = user();
    const r = await rooms.create(a, options);
    await rooms.ai(a, r.id, 'hard');
    await rooms.ai(a, r.id, 'medium');
    await rooms.ready(a, r.id, true);
    await rooms.start(a, r.id);
    const stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isDoudizhu(stored.game)) throw new Error('wrong game');
    stored.game.currentIndex = 0;
    stored.nextActionAt = null;
    await rooms.store.put(stored);
    await rooms.action(a, r.id, { type: 'bid', value: 0 }, stored.revision);
    const before = (await rooms.store.get(r.id))!;
    expect(before.nextActionAt! - Date.now()).toBeGreaterThanOrEqual(450);
    expect(before.nextActionAt! - Date.now()).toBeLessThanOrEqual(1500);
    await rooms.tick();
    expect((await rooms.store.get(r.id))!.revision).toBe(before.revision);
    before.nextActionAt = Date.now() - 1;
    await rooms.store.put(before);
    await rooms.tick();
    const after = (await rooms.store.get(r.id))!;
    expect(after.revision).toBe(before.revision + 1);
    expect(after.game!.turnNumber).toBe(2);
  }, 15000);
  it('team results reward both farmers once and permit rematch', async () => {
    const rooms = setup(),
      a = { ...(await session('地主测试')).user },
      b = { ...(await session('农民一')).user },
      c = { ...(await session('农民二')).user };
    const r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    await rooms.join(c, r.code);
    for (const p of [a, b, c]) await rooms.ready(p, r.id, true);
    await rooms.start(a, r.id);
    let stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isDoudizhu(stored.game)) throw new Error('wrong game');
    stored.game.currentIndex = 0;
    await rooms.store.put(stored);
    await rooms.action(a, r.id, { type: 'bid', value: 3 }, stored.revision);
    stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isDoudizhu(stored.game)) throw new Error('wrong game');
    stored.game.currentIndex = 1;
    stored.game.hands[b.id] = [{ id: 'clubs-5', suit: 'clubs', rank: 5 }];
    stored.game.playCounts[a.id] = 1;
    await rooms.store.put(stored);
    await rooms.action(b, r.id, { type: 'play', cardIds: ['clubs-5'] }, stored.revision);
    expect((await rooms.store.get(r.id))!.resultSaved).toBe(true);
    for (const p of [b, c]) {
      const v = await profile(p.id);
      expect(v.matches[0]).toMatchObject({ won: true, gameName: '斗地主', score: 30, coinsDelta: 100 });
      expect(v.user.coins).toBe(p.coins + 100);
    }
    expect((await profile(a.id)).matches[0].won).toBe(false);
    await rooms.tick();
    expect((await profile(c.id)).user.coins).toBe(c.coins + 100);
    await rooms.rematch(a, r.id);
    expect((await rooms.sync(a, r.id)).game).toBeNull();
  });
});
