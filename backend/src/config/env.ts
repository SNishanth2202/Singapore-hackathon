import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { configureDns } from './dns';

// Load .env from project root (two levels up from src/config/)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.local', 'crm-source.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('5000')
    .transform((val) => Number(val)).pipe(z.number().int().min(1).max(65535)),
  API_VERSION: z.string().default('v1'),
  LOCAL_DEMO_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  HOSTED_PREVIEW: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  STORAGE_MODE: z.enum(['cloud', 'memory']).default('cloud'),
  HOST: z.string().default('127.0.0.1'),
  DNS_SERVERS: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  AI_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(100).default(6),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  DB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),

  // Generic hosted router settings. A configured AI_* namespace never borrows a legacy key.
  AI_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_PROTOCOL: z.enum(['chat_completions', 'responses']).optional(),
  AI_MODELS_URL: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).optional(),
  AI_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).optional(),
  AI_FREELLM_FALLBACK_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),

  // Sales workspace is human-approved by default. Provider credentials are server-only secrets.
  SALES_API_TOKEN: z.string().optional().refine(value => !value || value.length >= 32, 'SALES_API_TOKEN must be at least 32 characters.'),
  SALES_EMAIL_WEBHOOK_SECRET: z.string().optional().refine(value => !value || value.length >= 32, 'SALES_EMAIL_WEBHOOK_SECRET must be at least 32 characters.'),
  SALES_EMAIL_PROVIDER: z.enum(['mock', 'gmail', 'microsoft']).default('mock'),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REFRESH_TOKEN: z.string().optional(),
  SALES_FOLLOWUP_DELAY_DAYS: z.coerce.number().int().min(1).max(30).default(5),
  SALES_MAX_FOLLOWUPS: z.coerce.number().int().min(0).max(5).default(2),

  // Existing Desktop settings remain supported for local development.
  FREELLMAPI_BASE_URL: z.string().url().default('http://127.0.0.1:31415/v1')
    .refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    }, 'Use an HTTP(S) API URL without embedded credentials'),
  FREELLMAPI_API_KEY: z.string().default(''),
  FREELLMAPI_MODEL: z.string().min(1).default('auto'),
  FREELLMAPI_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).optional(),
  FREELLMAPI_USE_TOOLS: z.enum(['true','false']).default('false').transform(value=>value==='true'),
  FREELLMAPI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),

  // MongoDB
  MONGODB_URI: z.string().default(''),
  MONGODB_DB_NAME: z.string().default('enterprise_radar'),
  CRM_SOURCE_MONGODB_URI: z.string().optional(),
  CRM_SOURCE_DB_NAME: z.string().optional(),
  CRM_PORTFOLIO_CACHE_PATH: z.string().optional(),
  CRM_SOURCE_USE_SAVED_VIEW: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),

  // Neo4j
  NEO4J_URI: z.string().default(''),
  NEO4J_USERNAME: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().default(''),
  NEO4J_DATABASE: z.string().trim().min(1).default('neo4j'),

  // JWT
  JWT_SECRET: z.string().default(''),
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

  configureDns(result.data.DNS_SERVERS);
  return result.data;
}

export const env = validateEnv();
