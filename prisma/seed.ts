import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { games } from '../shared/catalog.js';
const prisma = new PrismaClient();
try {
  for (const game of games) {
    const data = {
      name: game.name,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      available: game.available,
    };
    await prisma.game.upsert({ where: { id: game.id }, create: { id: game.id, ...data }, update: data });
  }
  console.log(
    `Seed complete: ${games.length} catalog entries; UNO, Gomoku, Xiangqi, Doudizhu, Exploding Kittens and Holdem playable. No fake users or match records.`,
  );
} finally {
  await prisma.$disconnect();
}
