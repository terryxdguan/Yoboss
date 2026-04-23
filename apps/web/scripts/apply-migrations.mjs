#!/usr/bin/env node
// Applies SQL migrations from ../../supabase/migrations/*.sql to the database
// pointed at by DATABASE_URL. Tracks applied migrations in public._migrations
// so each file runs at most once; stops on first failure.
//
// Wired into Vercel build via the `vercel-build` script in package.json:
// every deploy reconciles schema before `next build` runs, so a migration
// file merged without being manually applied (as happened with 021) can no
// longer ship a broken prod.
//
// Run locally: `DATABASE_URL=postgres://... npm run db:migrate`.
// First-time setup for an existing database: `npm run db:baseline` marks
// every current migration file as applied without executing it, so the
// runner only picks up files added after the baseline.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

function findMigrationsDir() {
  let dir = resolve(__dirname, "..");
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "supabase", "migrations");
    if (existsSync(candidate)) return candidate;
    dir = resolve(dir, "..");
  }
  throw new Error("Could not locate supabase/migrations/ by walking up from " + __dirname);
}

const MODE = process.argv[2] === "--baseline" ? "baseline" : "migrate";

async function main() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    // Preview deploys may not have DATABASE_URL wired up — skip rather than
    // fail the build. Production deploys are expected to have it set; the
    // missing-env case there will surface as an app-level failure anyway.
    if (process.env.VERCEL_ENV === "production") {
      console.error("[migrate] DATABASE_URL missing on production deploy — aborting.");
      process.exit(1);
    }
    console.log("[migrate] DATABASE_URL not set — skipping (set VERCEL_ENV=production to hard-fail).");
    return;
  }

  const migrationsDir = findMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public._migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    if (MODE === "baseline") {
      for (const f of files) {
        await client.query(
          "INSERT INTO public._migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
          [f]
        );
      }
      console.log(`[migrate] baseline complete — ${files.length} migration(s) marked as applied (nothing executed).`);
      return;
    }

    const { rows: appliedRows } = await client.query("SELECT filename FROM public._migrations");
    const applied = new Set(appliedRows.map((r) => r.filename));

    let ran = 0;
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = readFileSync(join(migrationsDir, f), "utf8");
      console.log(`[migrate] applying ${f}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO public._migrations (filename) VALUES ($1)", [f]);
        await client.query("COMMIT");
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[migrate] ${f} FAILED — rolled back. ${err.message || err}`);
        throw err;
      }
    }
    console.log(`[migrate] done. Applied ${ran} new migration(s). Total on record: ${applied.size + ran}.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] FATAL:", err.message || err);
  process.exit(1);
});
