import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import type { ChatMessage, Player, RoomOptions } from '../../../shared/types.js';
import type { UnoState } from '../../../shared/games/uno/index.js';
export interface StoredRoom {
  id: string;
  code: string;
  hostId: string;
  options: RoomOptions;
  players: Player[];
  spectators: string[];
  status: 'waiting' | 'playing' | 'finished';
  chats: ChatMessage[];
  game: UnoState | null;
  revision: number;
  matchId: string | null;
  startedAt: string | null;
  resultSaved: boolean;
  updatedAt: number;
  nextActionAt: number | null;
}
export interface RoomStore {
  get(id: string): Promise<StoredRoom | null>;
  put(room: StoredRoom): Promise<void>;
  list(): Promise<StoredRoom[]>;
  lock<T>(key: string, task: () => Promise<T>): Promise<T>;
  redis?: Redis;
}
export class MemoryStore implements RoomStore {
  private rooms = new Map<string, StoredRoom>();
  private queues = new Map<string, Promise<void>>();
  async get(id: string) {
    return structuredClone(this.rooms.get(id) ?? null);
  }
  async put(room: StoredRoom) {
    this.rooms.set(room.id, structuredClone(room));
  }
  async list() {
    return structuredClone([...this.rooms.values()]);
  }
  async lock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => next);
    this.queues.set(key, tail);
    await prev;
    try {
      return await task();
    } finally {
      release();
      if (this.queues.get(key) === tail) this.queues.delete(key);
    }
  }
}
export class RedisStore implements RoomStore {
  redis: Redis;
  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 2 });
    this.redis.on('error', (e) => console.error('Redis:', e.message));
  }
  async get(id: string) {
    const data = await this.redis.get(`playroom:room:${id}`);
    return data ? (JSON.parse(data) as StoredRoom) : null;
  }
  async put(room: StoredRoom) {
    await this.redis
      .multi()
      .set(`playroom:room:${room.id}`, JSON.stringify(room))
      .sadd('playroom:rooms', room.id)
      .exec();
  }
  async list() {
    const ids = await this.redis.smembers('playroom:rooms');
    if (!ids.length) return [];
    const data = await this.redis.mget(ids.map((id) => `playroom:room:${id}`));
    return data.filter((d): d is string => Boolean(d)).map((d) => JSON.parse(d) as StoredRoom);
  }
  async lock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const name = `playroom:lock:${key}`;
    const deadline = Date.now() + 8000;
    while ((await this.redis.set(name, token, 'PX', 30000, 'NX')) !== 'OK') {
      if (Date.now() > deadline) throw new Error('房间繁忙，请稍后重试');
      await new Promise((resolve) => setTimeout(resolve, 35 + Math.random() * 40));
    }
    let lost = false;
    const renewal = setInterval(() => {
      void this.redis
        .eval(
          "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('pexpire',KEYS[1],ARGV[2]) else return 0 end",
          1,
          name,
          token,
          '30000',
        )
        .then((v) => {
          if (v !== 1) lost = true;
        })
        .catch(() => {
          lost = true;
        });
    }, 8000);
    try {
      const result = await task();
      if (lost) throw new Error('房间锁失效，请重新同步');
      return result;
    } finally {
      clearInterval(renewal);
      await this.redis.eval(
        "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
        1,
        name,
        token,
      );
    }
  }
}
