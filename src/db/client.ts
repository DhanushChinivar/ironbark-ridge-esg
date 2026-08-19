import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '../env.js';
import * as schema from './schema.js';

// HTTP driver rather than a pool: on Vercel every request gets its own
// short-lived instance, and pooled TCP connections get exhausted fast.
export const db = drizzle(neon(env.DATABASE_URL), { schema });
export { schema };
