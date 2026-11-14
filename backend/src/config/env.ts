import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env from project root (two levels up from src/config/)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),
  API_VERSION: z.string().default('v1'),
  LOCAL_DEMO_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),

  // FreeLLMAPI is called only by the backend. Keep its key out of frontend config.
  FREELLMAPI_BASE_URL: z.string().url().default('http://127.0.0.1:31415/v1')
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    }, 'Use an HTTP(S) API URL without embedded credentials'),
  FREELLMAPI_API_KEY: z.string().default(''),
  FREELLMAPI_MODEL: z.string().min(1).default('auto'),
  FREELLMAPI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('enterprise_radar'),

  // Neo4j
  NEO4J_URI: z.string().min(1, 'NEO4J_URI is required'),
  NEO4J_USERNAME: z.string().min(1, 'NEO4J_USERNAME is required'),
  NEO4J_PASSWORD: z.string().min(1, 'NEO4J_PASSWORD is required'),

  // JWT
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
});

type EnvConfig = z.infer<typeof envSchema>;

function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
