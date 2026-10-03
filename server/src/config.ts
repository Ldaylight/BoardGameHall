import 'dotenv/config';
import { z } from 'zod';
const env = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
    DEMO_MODE: z.enum(['true', 'false']).default('true'),
    REDIS_URL: z.string().optional(),
    DATABASE_URL: z.string().optional(),
  })
  .parse(process.env);
export const config = {
  port: env.PORT,
  origin: env.CLIENT_ORIGIN,
  demo: env.DEMO_MODE === 'true',
  redisUrl: env.REDIS_URL || undefined,
};
if (!config.demo && !env.DATABASE_URL)
  throw new Error('DATABASE_URL is required in MySQL mode. Copy .env.example to .env.');
