import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { RoomService, type GameServer } from '../server/src/services/rooms';
import { MemoryStore } from '../server/src/services/store';
import { session, profile } from '../server/src/services/database';
import { isHoldem } from '../shared/games';
import { holdemView } from '../shared/games/views';
import type { RoomOptions, User } from '../shared/types';
const options: RoomOptions = {
  gameId: 'holdem',
  name: '德州测试',
  maxPlayers: 3,
  allowAI: true,
  allowSpectators: true,
  difficulty: 'hard',
};
const user = (): User => ({ id: randomUUID(), name: '扑克玩家', avatar: 'leaf', coins: 1000, level: 1 });
const setup = () =>
  new RoomService(new MemoryStore(), {
    emit: vi.fn(),
    to: () => ({ emit: vi.fn() }),
  } as unknown as GameServer);
describe('Holdem uses shared authoritative rooms', () => {
  it('rejects bad options, retains private hands on reconnect and rejects observers/races/foreign actions', async () => {
    const rooms = setup(),
      a = user(),
      b = user(),
      observer = user();
    await expect(
      rooms.create(a, { ...options, holdem: { startingStack: 100, smallBlind: 80 } }),
    ).rejects.toThrow('配置');
    const r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    for (const p of [a, b]) await rooms.ready(p, r.id, true);
    await rooms.start(a, r.id);
    const own = await rooms.sync(a, r.id),
      before = holdemView(own).hand;
    expect(holdemView(await rooms.join(observer, r.code, true)).hand).toEqual([]);
    expect(JSON.stringify(holdemView(await rooms.sync(b, r.id)))).not.toContain(before[0].id);
    await expect(rooms.action(observer, r.id, { type: 'poker:fold' }, own.revision)).rejects.toThrow('观战');
    await expect(
      rooms.action(a, r.id, { type: 'draw' }, (await rooms.sync(a, r.id)).revision),
    ).rejects.toThrow('不支持');
    await rooms.presence(a.id, false);
    await rooms.sync(a, r.id);
    const current = await rooms.sync(a, r.id);
    expect(holdemView(current).hand).toEqual(before);
    const raced = await Promise.allSettled([
      rooms.action(a, r.id, { type: 'poker:call' }, current.revision),
      rooms.action(a, r.id, { type: 'poker:call' }, current.revision),
    ]);
    expect(raced.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('AI waits 2–3 seconds and uses public-view worker actions through the revision path', async () => {
    const rooms = setup(),
      a = user(),
      r = await rooms.create(a, options);
    await rooms.ai(a, r.id, 'hard');
    await rooms.ready(a, r.id, true);
    await rooms.start(a, r.id);
    let stored = (await rooms.store.get(r.id))!;
    await rooms.action(a, r.id, { type: 'poker:call' }, stored.revision);
    stored = (await rooms.store.get(r.id))!;
    expect(stored.nextActionAt! - Date.now()).toBeGreaterThan(1950);
    expect(stored.nextActionAt! - Date.now()).toBeLessThanOrEqual(3000);
    const rev = stored.revision;
    stored.nextActionAt = Date.now() - 1;
    await rooms.store.put(stored);
    await rooms.tick();
    expect((await rooms.store.get(r.id))!.revision).toBe(rev + 1);
  });
  it('auto-deals after showdown even if a human reconnects or synchronizes', async () => {
    const rooms = setup(),
      a = user(),
      b = user(),
      r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    for (const p of [a, b]) await rooms.ready(p, r.id, true);
    await rooms.start(a, r.id);
    await rooms.action(a, r.id, { type: 'poker:fold' }, (await rooms.sync(a, r.id)).revision);
    let stored = (await rooms.store.get(r.id))!;
    expect(holdemView(await rooms.sync(b, r.id)).phase).toBe('showdown');
    expect((await rooms.store.get(r.id))!.nextActionAt).toBe(stored.game!.turnDeadline);
    if (!stored.game || !isHoldem(stored.game)) throw Error('wrong game');
    stored.game.turnDeadline = Date.now() - 1;
    stored.nextActionAt = stored.game.turnDeadline;
    await rooms.store.put(stored);
    await rooms.tick();
    expect(holdemView(await rooms.sync(a, r.id)).handNumber).toBe(2);
  });
  it('persists exactly once, awards final winner only, and supports rematch', async () => {
    const rooms = setup(),
      a = (await session('德州一')).user,
      b = (await session('德州二')).user,
      r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    for (const p of [a, b]) await rooms.ready(p, r.id, true);
    await rooms.start(a, r.id);
    const stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isHoldem(stored.game)) throw Error('wrong game');
    stored.game.street = 'river';
    stored.game.community = [2, 4, 7, 9, 11].map((rank, i) => ({
      rank,
      suit: i % 2 ? 'hearts' : 'spades',
      id: `board${i}`,
    }));
    stored.game.hands[a.id] = [
      { rank: 14, suit: 'clubs', id: 'a1' },
      { rank: 14, suit: 'diamonds', id: 'a2' },
    ];
    stored.game.hands[b.id] = [
      { rank: 13, suit: 'clubs', id: 'b1' },
      { rank: 13, suit: 'diamonds', id: 'b2' },
    ];
    await rooms.store.put(stored);
    await rooms.action(a, r.id, { type: 'poker:all-in' }, stored.revision);
    await rooms.action(b, r.id, { type: 'poker:call' }, (await rooms.sync(b, r.id)).revision);
    const ended = await rooms.sync(a, r.id);
    expect(ended.resultSaved).toBe(true);
    expect(holdemView(ended).stacks[a.id]).toBe(2000);
    const winner = await profile(a.id),
      loser = await profile(b.id);
    expect(winner.matches[0]).toMatchObject({ gameName: '德州扑克', won: true, coinsDelta: 100 });
    expect(loser.matches[0]).toMatchObject({ gameName: '德州扑克', won: false, coinsDelta: 10 });
    await rooms.tick();
    expect((await profile(a.id)).user.coins).toBe(winner.user.coins);
    await rooms.rematch(a, r.id);
    expect((await rooms.sync(a, r.id)).game).toBeNull();
  });
});
