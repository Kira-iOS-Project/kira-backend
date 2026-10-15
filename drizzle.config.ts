import { defineConfig } from 'drizzle-kit';

/** `db:generate` reads only the schema and connects to nothing. There is no fallback URL: a
   drizzle-kit command that does connect gets DATABASE_URL or fails, rather than trying a login
   written into the repo. */
export default defineConfig({
  schema: './src/db/schema/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
