import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../server/src/services/store';
import { RoomService, type GameServer } from '../server/src/services/rooms';
import { session, profile } from '../server/src/services/database';
import { isKittens } from '../shared/games';
import { kittensView } from '../shared/games/views';
import type { RoomOptions, User } from '../shared/types';
const options: RoomOptions = {
  gameId: 'exploding-kittens',
  name: '炸弹猫测试',
  maxPlayers: 3,
  allowAI: true,
  allowSpectators: true,
  difficulty: 'medium',
};
const user = (): User => ({ id: randomUUID(), name: '猫友', avatar: 'leaf', coins: 1000, level: 1 });
const setup = () =>
  new RoomService(new MemoryStore(), {
    emit: vi.fn(),
    to: () => ({ emit: vi.fn() }),
  } as unknown as GameServer);
describe('Kittens authoritative shared rooms', () => {
  it('sync and rejoin stop offline automation for the gift recipient, even outside their normal turn', async () => {
    const rooms = setup(),
      a = user(),
      b = user(),
      r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    for (const p of [a, b]) await rooms.ready(p, r.id, true);
    await rooms.start(a, r.id);
    let stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isKittens(stored.game)) throw Error('wrong game');
    stored.game.hands[a.id].push({ id: 'test-favor', kind: 'favor' });
    await rooms.store.put(stored);
    await rooms.action(
      a,
      r.id,
      { type: 'ek:play', cardIds: ['test-favor'], targetId: b.id },
      stored.revision,
    );
    stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isKittens(stored.game)) throw Error('wrong game');
    await rooms.action(b, r.id, { type: 'ek:allow', pendingId: stored.game.pending!.id }, stored.revision);
    expect(kittensView(await rooms.sync(a, r.id)).actorId).toBe(b.id);
    await rooms.presence(b.id, false);
    expect((await rooms.store.get(r.id))!.nextActionAt).not.toBeNull();
    await rooms.sync(b, r.id);
    expect((await rooms.store.get(r.id))!.nextActionAt).toBeNull();
    await rooms.presence(b.id, false);
    await rooms.join(b, r.code);
    expect((await rooms.store.get(r.id))!.nextActionAt).toBeNull();
    expect(kittensView(await rooms.sync(b, r.id)).phase).toBe('favor');
  });
  it('shares preparation, chat, private reconnect and rejects spectators/revisions/foreign actions', async () => {
    const rooms = setup(),
      a = user(),
      b = user(),
      observer = user();
    await expect(rooms.create(a, { ...options, maxPlayers: 6 })).rejects.toThrow('5 人');
    const r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    await rooms.ready(a, r.id, true);
    await rooms.ready(b, r.id, true);
    await rooms.start(a, r.id);
    const watched = await rooms.join(observer, r.code, true);
    expect(kittensView(watched).hand).toEqual([]);
    const v = await rooms.sync(a, r.id),
      id = kittensView(v).hand[0].id;
    expect(kittensView(await rooms.sync(b, r.id)).hand.some((c) => c.id === id)).toBe(false);
    await expect(rooms.action(observer, r.id, { type: 'ek:draw' }, v.revision)).rejects.toThrow('观战');
    await expect(rooms.action(a, r.id, { type: 'draw' }, v.revision)).rejects.toThrow('不支持');
    await rooms.chat(a, r.id, '猫猫要拆弹 🐈');
    expect((await rooms.sync(b, r.id)).chats.at(-1)!.text).toContain('🐈');
    await rooms.presence(a.id, false);
    await rooms.presence(a.id, true);
    expect(kittensView(await rooms.sync(a, r.id)).hand).toEqual(kittensView(v).hand);
    const current = await rooms.sync(a, r.id);
    const race = await Promise.allSettled([
      rooms.action(a, r.id, { type: 'ek:draw' }, current.revision),
      rooms.action(a, r.id, { type: 'ek:draw' }, current.revision),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('uses standard AI revision actions and resolves expired responses before letting Favor target give', async () => {
    const rooms = setup(),
      a = user(),
      r = await rooms.create(a, options);
    await rooms.ai(a, r.id, 'medium');
    await rooms.ready(a, r.id, true);
    await rooms.start(a, r.id);
    let stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isKittens(stored.game)) throw Error('wrong game');
    const bot = stored.players.find((p) => p.isAI)!;
    stored.game.hands[a.id] = [{ id: 'favor-test', kind: 'favor' }];
    await rooms.store.put(stored);
    await rooms.action(
      a,
      r.id,
      { type: 'ek:play', cardIds: ['favor-test'], targetId: bot.id },
      stored.revision,
    );
    stored = (await rooms.store.get(r.id))!;
    expect(stored.nextActionAt! - Date.now()).toBeGreaterThanOrEqual(450);
    expect(stored.nextActionAt! - Date.now()).toBeLessThanOrEqual(1500);
    if (!stored.game || !isKittens(stored.game)) throw Error('wrong game');
    stored.game.pending!.deadline = Date.now() - 1;
    stored.game.turnDeadline = Date.now() - 1;
    await rooms.store.put(stored);
    await rooms.tick();
    stored = (await rooms.store.get(r.id))!;
    expect(kittensView(await rooms.sync(a, r.id)).phase).toBe('favor');
    const revision = stored.revision,
      handBefore = kittensView(await rooms.sync(a, r.id)).hand.length;
    stored.nextActionAt = Date.now() - 1;
    await rooms.store.put(stored);
    await rooms.tick();
    expect((await rooms.store.get(r.id))!.revision).toBe(revision + 1);
    expect(kittensView(await rooms.sync(a, r.id)).hand).toHaveLength(handBefore + 1);
  });
  it('records survival results/rewards once, including eliminated players, and permits rematch', async () => {
    const rooms = setup(),
      a = (await session('猫一')).user,
      b = (await session('猫二')).user,
      r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    for (const p of [a, b]) await rooms.ready(p, r.id, true);
    await rooms.start(a, r.id);
    const stored = (await rooms.store.get(r.id))!;
    if (!stored.game || !isKittens(stored.game)) throw Error('wrong game');
    stored.game.hands[a.id] = [];
    stored.game.deck.unshift({ id: 'bomb-test', kind: 'explode' });
    await rooms.store.put(stored);
    await rooms.action(a, r.id, { type: 'ek:draw' }, stored.revision);
    expect((await rooms.store.get(r.id))!.resultSaved).toBe(true);
    const loser = await profile(a.id),
      winner = await profile(b.id);
    expect(loser.matches[0]).toMatchObject({ gameName: '炸弹猫', won: false, coinsDelta: 10 });
    expect(winner.matches[0]).toMatchObject({ gameName: '炸弹猫', won: true, coinsDelta: 100 });
    await rooms.tick();
    expect((await profile(b.id)).user.coins).toBe(winner.user.coins);
    await rooms.rematch(a, r.id);
    expect((await rooms.sync(a, r.id)).game).toBeNull();
  });
});
