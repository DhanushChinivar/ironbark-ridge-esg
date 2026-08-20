import { z } from 'zod';

// Node loads .env locally. On Vercel the variables are already in the process
// and no file exists, hence the tolerant call.
try {
  process.loadEnvFile('.env');
} catch {
  /* empty */
}

// An unset variable in .env arrives as '', not undefined, so optional() alone
// would reject a deliberately blank key.
const blankAsUndefined = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), inner);

const schema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgres'),
  ANTHROPIC_API_KEY: blankAsUndefined(z.string().min(1).optional()),
  ANTHROPIC_MODEL: blankAsUndefined(z.string().min(1).default('claude-sonnet-5')),
  PORT: blankAsUndefined(z.coerce.number().int().positive().default(3000)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;

// Only the enrichment job needs a key, so the pipeline runs without one.
export function requireAnthropicKey(): string {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required for the enrichment job (npm run enrich).');
  }
  return env.ANTHROPIC_API_KEY;
}
