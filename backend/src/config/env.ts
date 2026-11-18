import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://flotech_app:local_dev_only@localhost:5432/flotech_loan_saas'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  FIREBASE_PROJECT_ID: z.string().default('flotech-loan-saas-dev'),
  FIREBASE_STORAGE_BUCKET: z.string().default('flotech-loan-saas-dev.appspot.com'),
  ENFORCE_FIREBASE_APP_CHECK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid backend environment configuration:', parsedEnv.error.format());
  throw new Error('Failed to validate backend environment variables.');
}

export const env = {
  ...parsedEnv.data,
  corsAllowedOriginsList: parsedEnv.data.CORS_ALLOWED_ORIGINS.split(',').map((origin) =>
    origin.trim()
  ),
};
