import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs as its own binary and cannot inherit env loaded by our scripts.
try {
  process.loadEnvFile('.env');
} catch {
  /* empty */
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
