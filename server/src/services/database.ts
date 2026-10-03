import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import type { ChatMessage, Player, ProfileData, Session, User } from '../../../shared/types.js';
import type { StoredRoom } from './store.js';
export const prisma = config.demo ? null : new PrismaClient();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const users = new Map<string, User>();
const tokens = new Map<string, string>();
const matches = new Map<string, { room: StoredRoom; endedAt: string }>();
const friends = new Map<string, Set<string>>();
const publicUser = (u: { id: string; name: string; avatar: string; coins: number; level: number }): User => ({
  id: u.id,
  name: u.name,
  avatar: u.avatar,
  coins: u.coins,
  level: u.level,
});
export async function getUser(id: string): Promise<User | null> {
  return prisma
    ? await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, avatar: true, coins: true, level: true },
      })
    : (users.get(id) ?? null);
}
export async function authenticate(token: string): Promise<User | null> {
  if (!token || token.length > 128) return null;
  if (prisma) {
    const u = await prisma.user.findUnique({ where: { tokenHash: hash(token) } });
    return u ? publicUser(u) : null;
  }
  const id = tokens.get(hash(token));
  return id ? (users.get(id) ?? null) : null;
}
export async function session(name: string, existing?: string): Promise<Session> {
  if (existing) {
    const u = await authenticate(existing);
    if (u) return { user: u, token: existing, demo: config.demo };
  }
  const token = randomBytes(32).toString('hex');
  const user: User = { id: randomUUID(), name, avatar: 'leaf', coins: 1000, level: 1 };
  if (prisma) await prisma.user.create({ data: { ...user, tokenHash: hash(token) } });
  else {
    users.set(user.id, user);
    tokens.set(hash(token), user.id);
  }
  return { user, token, demo: config.demo };
}
export async function updateUser(id: string, name: string): Promise<User> {
  if (prisma) return publicUser(await prisma.user.update({ where: { id }, data: { name } }));
  const u = users.get(id)!;
  u.name = name;
  return { ...u };
}
export async function createRoomRecord(room: StoredRoom) {
  if (!prisma) return;
  await prisma.$transaction(async (tx) => {
    await tx.room.create({
      data: {
        id: room.id,
        code: room.code,
        name: room.options.name,
        gameId: room.options.gameId,
        hostId: room.hostId,
        maxPlayers: room.options.maxPlayers,
        allowAI: room.options.allowAI,
        allowSpectators: room.options.allowSpectators,
        difficulty: room.options.difficulty,
      },
    });
    const p = room.players[0];
    await tx.roomPlayer.create({ data: seatData(room.id, p) });
  });
}
function seatData(roomId: string, p: Player) {
  return {
    roomId,
    userId: p.isAI ? null : p.id,
    playerId: p.id,
    name: p.name,
    seat: p.seat,
    isAI: p.isAI,
    difficulty: p.difficulty,
  };
}
export async function joinRoomRecord(room: StoredRoom, p: Player) {
  if (!prisma) return;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Room WHERE id = ${room.id} FOR UPDATE`;
    const count = await tx.roomPlayer.count({ where: { roomId: room.id } });
    if (count >= room.options.maxPlayers) throw new Error('房间已满');
    await tx.roomPlayer.create({ data: seatData(room.id, p) });
  });
}
export async function removeSeatRecord(room: StoredRoom, id: string) {
  if (!prisma) return;
  await prisma.$transaction(async (tx) => {
    await tx.roomPlayer.deleteMany({ where: { roomId: room.id, playerId: id } });
    await tx.room.update({ where: { id: room.id }, data: { hostId: room.hostId, status: room.status } });
  });
}
export async function updateRoomRecord(room: StoredRoom) {
  if (prisma)
    await prisma.room.update({ where: { id: room.id }, data: { status: room.status, hostId: room.hostId } });
}
export async function saveChat(message: ChatMessage, roomId: string) {
  if (prisma)
    await prisma.chatMessage.create({ data: { ...message, roomId, createdAt: new Date(message.createdAt) } });
}
export async function finishMatch(room: StoredRoom) {
  if (!room.game?.winnerId || !room.matchId || !room.startedAt) return;
  const winnerId = room.game.winnerId;
  const matchId = room.matchId;
  if (!prisma) {
    if (matches.has(matchId)) return;
    matches.set(matchId, { room: structuredClone(room), endedAt: new Date().toISOString() });
    for (const p of room.players.filter((p) => !p.isAI)) {
      const u = users.get(p.id);
      if (u) {
        u.coins += p.id === winnerId ? 100 : 10;
        u.level++;
      }
    }
    return;
  }
  await prisma.$transaction(async (tx) => {
    // Room row lock serializes duplicate result attempts across instances and makes rewards exactly once.
    await tx.$queryRaw`SELECT id FROM Room WHERE id = ${room.id} FOR UPDATE`;
    if (await tx.match.findUnique({ where: { id: matchId } })) return;
    await tx.match.create({
      data: {
        id: matchId,
        roomId: room.id,
        gameId: room.options.gameId,
        winnerId,
        startedAt: new Date(room.startedAt!),
        publicResult: { winnerId, turns: room.game!.turnNumber },
        players: {
          create: room.players.map((p) => ({
            userId: p.isAI ? null : p.id,
            playerId: p.id,
            name: p.name,
            isAI: p.isAI,
            won: p.id === winnerId,
            score: p.id === winnerId ? 30 : 5,
            coinsDelta: p.isAI ? 0 : p.id === winnerId ? 100 : 10,
          })),
        },
      },
    });
    for (const p of room.players.filter((p) => !p.isAI)) {
      const won = p.id === winnerId;
      const coins = won ? 100 : 10;
      const score = won ? 30 : 5;
      await tx.user.update({
        where: { id: p.id },
        data: { coins: { increment: coins }, level: { increment: 1 } },
      });
      await tx.ranking.upsert({
        where: { userId_gameId: { userId: p.id, gameId: room.options.gameId } },
        create: { userId: p.id, gameId: room.options.gameId, played: 1, wins: won ? 1 : 0, score },
        update: { played: { increment: 1 }, wins: { increment: won ? 1 : 0 }, score: { increment: score } },
      });
    }
    await tx.room.update({ where: { id: room.id }, data: { status: 'finished' } });
  });
}
// Reserved for paid room types; the conditional update prevents negative balances.
export async function debitCoins(userId: string, amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('金币金额无效');
  if (prisma)
    return prisma.$transaction(async (tx) => {
      const r = await tx.user.updateMany({
        where: { id: userId, coins: { gte: amount } },
        data: { coins: { decrement: amount } },
      });
      if (!r.count) throw new Error('金币不足');
      return tx.user.findUniqueOrThrow({ where: { id: userId } });
    });
  const u = users.get(userId);
  if (!u || u.coins < amount) throw new Error('金币不足');
  u.coins -= amount;
  return { ...u };
}
export async function addFriend(userId: string, friendId: string) {
  if (userId === friendId) throw new Error('不能添加自己');
  if (!(await getUser(friendId))) throw new Error('玩家 ID 不存在');
  if (prisma)
    await prisma.friend.upsert({
      where: { userId_friendId: { userId, friendId } },
      create: { userId, friendId },
      update: {},
    });
  else {
    const list = friends.get(userId) ?? new Set<string>();
    list.add(friendId);
    friends.set(userId, list);
  }
}
export async function profile(userId: string): Promise<ProfileData> {
  const user = await getUser(userId);
  if (!user) throw new Error('用户不存在');
  if (prisma) {
    const [rows, relations, ranking] = await Promise.all([
      prisma.matchPlayer.findMany({
        where: { userId },
        include: { match: { include: { game: true } } },
        orderBy: { match: { endedAt: 'desc' } },
        take: 20,
      }),
      prisma.friend.findMany({ where: { userId }, include: { friend: true } }),
      prisma.ranking.findMany({
        where: { gameId: 'uno' },
        include: { user: true },
        orderBy: [{ score: 'desc' }, { wins: 'desc' }],
        take: 20,
      }),
    ]);
    return {
      user,
      matches: rows.map((r) => ({
        id: r.matchId,
        gameName: r.match.game.name,
        won: r.won,
        createdAt: r.match.endedAt.toISOString(),
        score: r.score,
      })),
      friends: relations.map((r) => publicUser(r.friend)),
      rankings: ranking.map((r) => ({
        user: publicUser(r.user),
        wins: r.wins,
        played: r.played,
        score: r.score,
      })),
    };
  }
  const ranking = new Map<string, { user: User; wins: number; played: number; score: number }>();
  for (const { room } of matches.values())
    for (const p of room.players.filter((p) => !p.isAI)) {
      const u = users.get(p.id);
      if (!u) continue;
      const r = ranking.get(p.id) ?? { user: { ...u }, wins: 0, played: 0, score: 0 };
      r.played++;
      if (p.id === room.game?.winnerId) {
        r.wins++;
        r.score += 30;
      } else r.score += 5;
      ranking.set(p.id, r);
    }
  return {
    user: { ...user },
    matches: [...matches.entries()]
      .filter(([, m]) => m.room.players.some((p) => p.id === userId))
      .reverse()
      .slice(0, 20)
      .map(([id, m]) => ({
        id,
        gameName: 'UNO',
        won: m.room.game?.winnerId === userId,
        createdAt: m.endedAt,
        score: m.room.game?.winnerId === userId ? 30 : 5,
      })),
    friends: [...(friends.get(userId) ?? [])].map((id) => users.get(id)!).filter(Boolean),
    rankings: [...ranking.values()].sort((a, b) => b.score - a.score),
  };
}
