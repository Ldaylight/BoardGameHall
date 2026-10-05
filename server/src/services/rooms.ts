import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import type {
  ClientEvents,
  Difficulty,
  Player,
  RoomOptions,
  RoomSummary,
  RoomView,
  ServerEvents,
  User,
  GameAction,
} from '../../../shared/types.js';
import { uno } from '../../../shared/games/uno/index.js';
import {
  applyGameAction,
  createGame,
  gameFinished,
  gameView,
  isGomoku,
  isXiangqi,
  isDoudizhu,
  isKittens,
} from '../../../shared/games/index.js';
import { timeout } from '../../../shared/games/gomoku/index.js';
import { computeGomokuMove } from './gomoku-ai.js';
import { xiangqi, xiangqiTimeout } from '../../../shared/games/xiangqi/index.js';
import { endgames } from '../../../shared/games/xiangqi/endgames.js';
import { computeXiangqiMove } from './xiangqi-ai.js';
import { computeDoudizhuMove } from './doudizhu-ai.js';
import { doudizhu } from '../../../shared/games/doudizhu/index.js';
import {
  kittens,
  kittensActor,
  resolveKittensPending,
} from '../../../shared/games/exploding-kittens/index.js';
import {
  createRoomRecord,
  finishMatch,
  getUser,
  joinRoomRecord,
  removeSeatRecord,
  saveChat,
  updateRoomRecord,
} from './database.js';
import type { RoomStore, StoredRoom } from './store.js';
export type GameServer = Server<ClientEvents, ServerEvents, Record<string, never>, { user: User }>;
const aiDelay = (gomoku: boolean) => (gomoku ? 500 : 2000) + randomInt(1001);
export class RoomService {
  constructor(
    readonly store: RoomStore,
    private io: GameServer,
  ) {}
  summary(r: StoredRoom): RoomSummary {
    return {
      id: r.id,
      code: r.code,
      name: r.options.name,
      gameId: r.options.gameId,
      maxPlayers: r.options.maxPlayers,
      playerCount: r.players.length,
      status: r.status,
      allowSpectators: r.options.allowSpectators,
    };
  }
  view(r: StoredRoom, userId: string): RoomView {
    return {
      ...this.summary(r),
      hostId: r.hostId,
      options: r.options,
      players: r.players,
      chats: r.chats,
      game: r.game
        ? gameView(r.game, r.players.some((p) => p.id === userId && !p.hasLeft) ? userId : null)
        : null,
      revision: r.revision,
      matchId: r.matchId,
      resultSaved: r.resultSaved,
    };
  }
  async list() {
    return (await this.store.list())
      .filter((r) => r.players.some((p) => !p.isAI && !p.hasLeft))
      .map((r) => this.summary(r));
  }
  async current(user: User) {
    // Active seats take priority over finished tables and spectator memberships.
    const candidates = (await this.store.list())
      .filter((r) => r.players.some((p) => p.id === user.id && !p.hasLeft) || r.spectators.includes(user.id))
      .sort((a, b) => {
        const priority = (r: StoredRoom) =>
          r.players.some((p) => p.id === user.id && !p.hasLeft) ? (r.status === 'finished' ? 1 : 2) : 0;
        return priority(b) - priority(a) || b.updatedAt - a.updatedAt;
      });
    for (const candidate of candidates) {
      const view = await this.store.lock(`room:${candidate.id}`, async () => {
        const r = await this.store.get(candidate.id);
        if (!r || (!r.players.some((p) => p.id === user.id && !p.hasLeft) && !r.spectators.includes(user.id)))
          return null;
        return this.view(r, user.id);
      });
      if (view) return view;
    }
    return null;
  }
  private async requireRoom(id: string) {
    const r = await this.store.get(id);
    if (!r) throw new Error('房间不存在，或体验服务器已重启');
    return r;
  }
  private requireHost(r: StoredRoom, id: string) {
    if (r.hostId !== id) throw new Error('只有房主能执行这个操作');
  }
  private requireMember(r: StoredRoom, id: string) {
    if (!r.players.some((p) => p.id === id && !p.hasLeft) && !r.spectators.includes(id))
      throw new Error('请先加入房间');
  }
  private async noOtherSeat(id: string, roomId?: string) {
    const previous = (await this.store.list()).find(
      (r) => r.id !== roomId && r.status !== 'finished' && r.players.some((p) => p.id === id && !p.hasLeft),
    );
    if (previous) throw new Error(`你已在房间 ${previous.code}，请先返回该房间并离开`);
  }
  private player(user: User, seat: number): Player {
    return { ...user, seat, ready: false, isAI: false, difficulty: 'medium', connected: true };
  }
  async create(user: User, options: RoomOptions) {
    user = (await getUser(user.id)) ?? user;
    return this.store.lock(`user:${user.id}`, async () => {
      await this.noOtherSeat(user.id);
      if (!['uno', 'gomoku', 'xiangqi', 'doudizhu', 'exploding-kittens'].includes(options.gameId))
        throw new Error('该游戏尚未开放');
      if (options.gameId === 'doudizhu' && options.maxPlayers !== 3) throw new Error('斗地主必须为 3 人');
      if (options.gameId === 'exploding-kittens' && options.maxPlayers > 5)
        throw new Error('炸弹猫经典版最多 5 人');
      if (!Number.isInteger(options.maxPlayers) || options.maxPlayers < 2 || options.maxPlayers > 6)
        throw new Error('人数必须在 2–6 之间');
      if (options.gameId === 'gomoku' && options.maxPlayers !== 2) throw new Error('五子棋必须为 2 人');
      if (options.gameId === 'xiangqi') {
        if (options.maxPlayers !== 2) throw new Error('中国象棋必须为 2 人');
        if (options.xiangqi?.mode === 'puzzle' && !endgames.some((p) => p.id === options.xiangqi?.puzzleId))
          throw new Error('残局不存在');
        const seconds = options.xiangqi?.turnSeconds ?? 60;
        if (!Number.isInteger(seconds) || seconds < 15 || seconds > 180)
          throw new Error('回合时限必须在 15–180 秒之间');
      }
      if (
        options.gomoku?.turnSeconds !== undefined &&
        (!Number.isInteger(options.gomoku.turnSeconds) ||
          options.gomoku.turnSeconds < 15 ||
          options.gomoku.turnSeconds > 180)
      )
        throw new Error('回合时限必须在 15–180 秒之间');
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      const existing = new Set((await this.store.list()).map((r) => r.code));
      do {
        code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      } while (existing.has(code));
      const room: StoredRoom = {
        id: randomUUID(),
        code,
        hostId: user.id,
        options,
        players: [this.player(user, 0)],
        spectators: [],
        status: 'waiting',
        chats: [],
        game: null,
        revision: 1,
        matchId: null,
        startedAt: null,
        resultSaved: false,
        updatedAt: Date.now(),
        nextActionAt: null,
      };
      await createRoomRecord(room);
      await this.store.put(room);
      await this.broadcast(room);
      return this.view(room, user.id);
    });
  }
  async join(user: User, code: string, spectate = false) {
    user = (await getUser(user.id)) ?? user;
    return this.store.lock(`user:${user.id}`, async () => {
      const found = (await this.store.list()).find((r) => r.code === code.toUpperCase());
      if (!found) throw new Error('房间码不存在');
      return this.store.lock(`room:${found.id}`, async () => {
        const r = await this.requireRoom(found.id);
        if (r.players.some((p) => p.id === user.id)) {
          await this.noOtherSeat(user.id, r.id);
          const p = r.players.find((p) => p.id === user.id)!;
          p.connected = true;
          p.hasLeft = false;
          if (r.game && (isKittens(r.game) || r.game.players[r.game.currentIndex] === user.id))
            this.schedule(r);
          await this.commit(r);
          return this.view(r, user.id);
        }
        if (spectate || r.status === 'playing') {
          if (!r.options.allowSpectators) throw new Error('这个房间未开放观战');
          if (!r.spectators.includes(user.id)) {
            if (r.spectators.length >= 50) throw new Error('观战人数已满');
            r.spectators.push(user.id);
          }
        } else {
          if (r.status !== 'waiting') throw new Error('牌局已结束');
          await this.noOtherSeat(user.id, r.id);
          if (r.players.length >= r.options.maxPlayers) throw new Error('房间已满');
          const seat = Array.from({ length: r.options.maxPlayers }, (_, i) => i).find(
            (i) => !r.players.some((p) => p.seat === i),
          )!;
          const p = this.player(user, seat);
          await joinRoomRecord(r, p);
          r.players.push(p);
          r.spectators = r.spectators.filter((id) => id !== user.id);
        }
        await this.commit(r);
        return this.view(r, user.id);
      });
    });
  }
  async sync(user: User, id: string) {
    return this.store.lock(`room:${id}`, async () => {
      const r = await this.requireRoom(id);
      this.requireMember(r, user.id);
      const p = r.players.find((p) => p.id === user.id);
      if (p && !p.connected) {
        p.connected = true;
        if (r.game && isKittens(r.game)) this.schedule(r);
        else if (r.game?.players[r.game.currentIndex] === user.id) r.nextActionAt = null;
        await this.commit(r);
      }
      return this.view(r, user.id);
    });
  }
  private async mutate(id: string, userId: string, task: (r: StoredRoom) => Promise<void>) {
    return this.store.lock(`room:${id}`, async () => {
      const r = await this.requireRoom(id);
      this.requireMember(r, userId);
      await task(r);
      await this.commit(r);
    });
  }
  async ready(user: User, id: string, ready: boolean) {
    await this.mutate(id, user.id, async (r) => {
      if (r.status !== 'waiting') throw new Error('牌局开始后不能修改准备状态');
      const p = r.players.find((p) => p.id === user.id);
      if (!p) throw new Error('观战玩家无法准备');
      p.ready = ready;
    });
  }
  async ai(user: User, id: string, difficulty: Difficulty, removeId?: string) {
    await this.mutate(id, user.id, async (r) => {
      this.requireHost(r, user.id);
      if (r.status !== 'waiting') throw new Error('只能在等待页管理 AI');
      if (!r.options.allowAI) throw new Error('此房间不允许 AI 补位');
      if (removeId) {
        const p = r.players.find((p) => p.id === removeId && p.isAI);
        if (!p) throw new Error('AI 不存在');
        r.players = r.players.filter((p) => p.id !== removeId);
        await removeSeatRecord(r, removeId);
        return;
      }
      if (r.players.length >= r.options.maxPlayers) throw new Error('座位已满');
      const seat = Array.from({ length: r.options.maxPlayers }, (_, i) => i).find(
        (i) => !r.players.some((p) => p.seat === i),
      )!;
      const p: Player = {
        id: randomUUID(),
        name: ['小柠 AI', '阿橙 AI', '蓝莓 AI', '薄荷 AI', '桃子 AI', '云朵 AI'][seat],
        avatar: 'bot',
        coins: 0,
        level: 1,
        seat,
        ready: true,
        isAI: true,
        difficulty,
        connected: true,
      };
      await joinRoomRecord(r, p);
      r.players.push(p);
    });
  }
  async start(user: User, id: string) {
    await this.mutate(id, user.id, async (r) => {
      this.requireHost(r, user.id);
      if (r.status !== 'waiting') throw new Error('房间已经开始');
      if (r.players.length < 2) throw new Error('至少需要 2 位玩家');
      if (r.options.gameId === 'doudizhu' && r.players.length !== 3)
        throw new Error('斗地主需要 3 位玩家，可添加 AI 补位');
      if (r.players.some((p) => !p.ready)) throw new Error('请等待所有玩家准备');
      r.players.sort((a, b) => a.seat - b.seat);
      r.game = createGame(
        r.options,
        r.players.map((p) => p.id),
      );
      r.status = 'playing';
      r.matchId = randomUUID();
      r.startedAt = new Date().toISOString();
      r.resultSaved = false;
      this.schedule(r);
      await updateRoomRecord(r);
    });
  }
  private schedule(r: StoredRoom) {
    if (!r.game || gameFinished(r.game)) {
      r.nextActionAt = null;
      return;
    }
    const p = this.actor(r);
    r.nextActionAt =
      p &&
      (p.isAI || (!p.connected && !((isGomoku(r.game) || isXiangqi(r.game)) && r.game.options.timeoutLoss)))
        ? Date.now() +
          aiDelay(isGomoku(r.game) || isXiangqi(r.game) || isDoudizhu(r.game) || isKittens(r.game))
        : null;
  }
  private actor(r: StoredRoom) {
    if (!r.game) return undefined;
    if (isKittens(r.game)) {
      const game = r.game;
      if (game.phase === 'reaction' && game.pending) {
        const waiting = r.players.filter(
          (p) => game.alive.includes(p.id) && !game.pending!.allowed.includes(p.id),
        );
        return waiting.find((p) => p.isAI || !p.connected) ?? waiting[0];
      }
      return r.players.find((p) => p.id === kittensActor(game));
    }
    if (isGomoku(r.game) && r.game.undoRequest) {
      const requester = r.game.undoRequest.playerId;
      const opponent = r.players.find((p) => p.id !== requester);
      if (opponent?.isAI) return opponent;
    }
    return r.players.find((p) => p.id === r.game!.players[r.game!.currentIndex]);
  }
  // Both Socket.IO game:action and AI actions enter this authority/revision path.
  private applyAction(r: StoredRoom, playerId: string, action: GameAction, revision: number) {
    if (r.status !== 'playing' || !r.game) throw new Error('对局尚未开始或已结束');
    if (revision !== r.revision) throw new Error('状态已更新，请按最新状态重试');
    r.game = applyGameAction(r.game, playerId, action);
    this.schedule(r);
    if (gameFinished(r.game)) r.status = 'finished';
  }
  async action(user: User, id: string, action: GameAction, revision: number) {
    await this.mutate(id, user.id, async (r) => {
      if (!r.players.some((p) => p.id === user.id && !p.hasLeft))
        throw new Error('观战玩家无法操作手牌或棋子');
      this.applyAction(r, user.id, action, revision);
    });
  }
  async chat(user: User, id: string, text: string) {
    await this.mutate(id, user.id, async (r) => {
      const recent = r.chats.filter(
        (m) => m.userId === user.id && Date.now() - new Date(m.createdAt).getTime() < 5000,
      );
      if (recent.length >= 5) throw new Error('消息发送过快，休息一下');
      const m = {
        id: randomUUID(),
        userId: user.id,
        name: user.name,
        text,
        createdAt: new Date().toISOString(),
      };
      await saveChat(m, r.id);
      r.chats.push(m);
      r.chats = r.chats.slice(-100);
    });
  }
  async leave(user: User, id: string) {
    await this.mutate(id, user.id, async (r) => {
      r.spectators = r.spectators.filter((p) => p !== user.id);
      const p = r.players.find((p) => p.id === user.id);
      if (!p) return;
      if (r.status === 'playing') {
        p.connected = false;
        p.hasLeft = true;
        if (r.hostId === user.id) {
          const next = r.players.find((p) => !p.isAI && !p.hasLeft);
          if (next) {
            r.hostId = next.id;
            await updateRoomRecord(r);
          }
        }
        this.schedule(r);
        return;
      }
      if (r.status === 'finished' && !r.resultSaved) throw new Error('结果正在保存，请稍后离开');
      r.players = r.players.filter((p) => p.id !== user.id);
      if (r.hostId === user.id) {
        const next = r.players.find((p) => !p.isAI);
        if (next) r.hostId = next.id;
        else {
          r.players = [];
          r.status = 'finished';
        }
      }
      await removeSeatRecord(r, user.id);
    });
  }
  async rematch(user: User, id: string) {
    await this.mutate(id, user.id, async (r) => {
      this.requireHost(r, user.id);
      if (r.status !== 'finished') throw new Error('牌局尚未结束');
      if (!r.resultSaved) throw new Error('结果正在保存，请稍后重试');
      r.game = null;
      r.status = 'waiting';
      r.matchId = null;
      r.startedAt = null;
      r.nextActionAt = null;
      const departed = r.players.filter((p) => p.hasLeft);
      r.players = r.players.filter((p) => !p.hasLeft);
      for (const p of departed) await removeSeatRecord(r, p.id);
      r.players.forEach((p) => {
        p.ready = p.isAI;
      });
      await updateRoomRecord(r);
    });
  }
  async presence(userId: string, connected: boolean) {
    const rooms = (await this.store.list()).filter((r) =>
      r.players.some((p) => p.id === userId && !p.hasLeft),
    );
    for (const room of rooms)
      await this.store.lock(`room:${room.id}`, async () => {
        const r = await this.requireRoom(room.id);
        const p = r.players.find((p) => p.id === userId && !p.hasLeft);
        if (!p) return;
        p.connected = connected;
        if (r.game && (isKittens(r.game) || r.game.players[r.game.currentIndex] === userId)) this.schedule(r);
        await this.commit(r);
      });
  }
  private async commit(r: StoredRoom) {
    r.revision++;
    r.updatedAt = Date.now();
    await this.store.put(r);
    if (r.status === 'finished' && r.game && gameFinished(r.game) && !r.resultSaved) {
      try {
        await finishMatch(r);
        r.resultSaved = true;
        await this.store.put(r);
      } catch (e) {
        console.error('Result save failed; scheduler will retry:', e);
      }
    }
    await this.broadcast(r);
  }
  async broadcast(r: StoredRoom) {
    for (const userId of new Set([
      ...r.players.filter((p) => !p.isAI && !p.hasLeft).map((p) => p.id),
      ...r.spectators,
    ])) {
      // Each authenticated user receives their own projected state. Never broadcast full game state.
      this.io.to(`user:${userId}`).emit(r.game ? 'game:state' : 'room:state', this.view(r, userId));
    }
    this.io.emit('lobby:update', await this.list());
  }
  async tick() {
    const rooms = await this.store.list();
    for (const snapshot of rooms) {
      if (
        snapshot.status === 'finished' &&
        snapshot.game &&
        gameFinished(snapshot.game) &&
        !snapshot.resultSaved
      ) {
        await this.store.lock(`room:${snapshot.id}`, async () => {
          const r = await this.requireRoom(snapshot.id);
          if (!r.resultSaved) await this.commit(r);
        });
        continue;
      }
      if (snapshot.status !== 'playing' || !snapshot.game) continue;
      const due =
        isKittens(snapshot.game) && snapshot.game.phase === 'reaction'
          ? Math.min(snapshot.nextActionAt ?? Infinity, snapshot.game.turnDeadline)
          : (snapshot.nextActionAt ?? snapshot.game.turnDeadline);
      if (Date.now() < due) continue;
      await this.store.lock(`room:${snapshot.id}`, async () => {
        const r = await this.requireRoom(snapshot.id);
        if (r.status !== 'playing' || !r.game) return;
        const currentDue =
          isKittens(r.game) && r.game.phase === 'reaction'
            ? Math.min(r.nextActionAt ?? Infinity, r.game.turnDeadline)
            : (r.nextActionAt ?? r.game.turnDeadline);
        if (Date.now() < currentDue) return;
        if (isKittens(r.game) && r.game.phase === 'reaction' && Date.now() >= r.game.turnDeadline) {
          r.game = resolveKittensPending(r.game);
          this.schedule(r);
          await this.commit(r);
          return;
        }
        const p = this.actor(r)!;
        if (
          (isGomoku(r.game) || isXiangqi(r.game)) &&
          r.game.options.timeoutLoss &&
          Date.now() >= r.game.turnDeadline
        ) {
          r.game = isGomoku(r.game) ? timeout(r.game) : xiangqiTimeout(r.game);
          r.status = 'finished';
          this.schedule(r);
        } else {
          const action = isKittens(r.game)
            ? kittens.aiMove(kittens.getView(r.game, p.id), p.id, p.difficulty)
            : isDoudizhu(r.game)
              ? await computeDoudizhuMove(doudizhu.getView(r.game, p.id), p.id, p.difficulty)
              : isXiangqi(r.game)
                ? await computeXiangqiMove(xiangqi.getView(r.game, p.id), p.id, p.difficulty)
                : isGomoku(r.game)
                  ? await computeGomokuMove(
                      gameView(r.game, p.id) as import('../../../shared/games/gomoku/types.js').GomokuView,
                      p.id,
                      p.difficulty,
                    )
                  : uno.aiMove(uno.getView(r.game, p.id), p.id, p.difficulty);
          this.applyAction(r, p.id, action, r.revision);
        }
        await this.commit(r);
      });
    }
  }
}
