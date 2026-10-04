import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../server/src/services/store';
import { RoomService, type GameServer } from '../server/src/services/rooms';
import type { RoomOptions, User } from '../shared/types';
const user = (name: string): User => ({ id: randomUUID(), name, avatar: 'leaf', coins: 1000, level: 1 });
const options: RoomOptions = {
  gameId: 'uno',
  name: 'Test',
  maxPlayers: 2,
  allowAI: true,
  allowSpectators: true,
  difficulty: 'medium',
};
function service() {
  const emit = vi.fn();
  const io = { emit, to: () => ({ emit }) } as unknown as GameServer;
  return { rooms: new RoomService(new MemoryStore(), io), emit };
}
describe('authoritative room lifecycle', () => {
  it('finds the current room after lobby refresh and releases it on explicit leave', async () => {
    const { rooms } = service();
    const a = user('a');
    expect(await rooms.current(a)).toBeNull();
    const r = await rooms.create(a, options);
    await rooms.presence(a.id, false);
    expect((await rooms.current(a))?.id).toBe(r.id);
    await expect(rooms.create(a, options)).rejects.toThrow('已在');
    await rooms.leave(a, r.id);
    expect(await rooms.current(a)).toBeNull();
    const next = await rooms.create(a, options);
    expect((await rooms.current(a))?.id).toBe(next.id);
  });
  it('serializes simultaneous joins and respects seat capacity', async () => {
    const { rooms } = service();
    const host = user('host');
    const r = await rooms.create(host, options);
    const results = await Promise.allSettled([rooms.join(user('b'), r.code), rooms.join(user('c'), r.code)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await rooms.store.get(r.id))?.players).toHaveLength(2);
  });
  it('requires host, readiness and membership, prevents stale actions, and projects spectator hand', async () => {
    const { rooms } = service();
    const a = user('a'),
      b = user('b'),
      spectator = user('s');
    const r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    await expect(rooms.start(b, r.id)).rejects.toThrow('房主');
    await expect(rooms.start(a, r.id)).rejects.toThrow('准备');
    await rooms.ready(a, r.id, true);
    await rooms.ready(b, r.id, true);
    await rooms.start(a, r.id);
    const view = await rooms.sync(a, r.id);
    expect(view.game?.hand).toHaveLength(7);
    expect((await rooms.join(spectator, r.code, true)).game?.hand).toHaveLength(0);
    await expect(rooms.sync(user('outsider'), r.id)).rejects.toThrow('加入');
    await expect(rooms.action(a, r.id, { type: 'draw' }, 0)).rejects.toThrow('更新');
  });
  it('AI only runs after a 2000–3000ms delay and reconnection preserves exact hand', async () => {
    const { rooms } = service();
    const a = user('a');
    const r = await rooms.create(a, options);
    await rooms.ai(a, r.id, 'medium');
    await rooms.ready(a, r.id, true);
    await rooms.start(a, r.id);
    const before = await rooms.sync(a, r.id);
    await rooms.presence(a.id, false);
    const disconnected = await rooms.store.get(r.id);
    expect(disconnected!.nextActionAt! - Date.now()).toBeGreaterThanOrEqual(1950);
    expect(disconnected!.nextActionAt! - Date.now()).toBeLessThanOrEqual(3000);
    await rooms.tick();
    expect((await rooms.store.get(r.id))?.game?.turnNumber).toBe(0);
    await rooms.presence(a.id, true);
    expect((await rooms.sync(a, r.id)).game?.hand).toEqual(before.game?.hand);
    await rooms.presence(a.id, false);
    const due = (await rooms.store.get(r.id))!.nextActionAt!;
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue(due - 1);
      await rooms.tick();
      expect((await rooms.store.get(r.id))!.game!.logs).toHaveLength(1);
      clock.mockReturnValue(due + 1);
      await rooms.tick();
      expect((await rooms.store.get(r.id))!.game!.logs.length).toBeGreaterThan(1);
    } finally {
      clock.mockRestore();
    }
  });
  it('intentional leave releases membership while AI takes over remaining hand', async () => {
    const { rooms } = service();
    const a = user('a'),
      b = user('b');
    const r = await rooms.create(a, options);
    await rooms.join(b, r.code);
    await rooms.ready(a, r.id, true);
    await rooms.ready(b, r.id, true);
    await rooms.start(a, r.id);
    await rooms.leave(a, r.id);
    await rooms.presence(a.id, true);
    const stored = await rooms.store.get(r.id);
    expect(stored?.players.find((p) => p.id === a.id)?.connected).toBe(false);
    expect(stored?.hostId).toBe(b.id);
    await expect(rooms.create(a, options)).resolves.toBeTruthy();
  });
  it('rejects closed spectators, second active rooms and non-host AI management', async () => {
    const { rooms } = service();
    const a = user('a'),
      b = user('b');
    const r = await rooms.create(a, { ...options, allowSpectators: false });
    await expect(rooms.create(a, options)).rejects.toThrow('已在');
    await rooms.join(b, r.code);
    await expect(rooms.ai(b, r.id, 'easy')).rejects.toThrow('房主');
    await expect(rooms.join(user('s'), r.code, true)).rejects.toThrow('观战');
  });
});
