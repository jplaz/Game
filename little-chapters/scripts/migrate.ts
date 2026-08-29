/**
 * Migration runner: applies supabase/migrations/*.sql in filename order,
 * tracking applied files in _migrations. Idempotent and transactional per file.
 *
 *   npm run db:migrate
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:54322/postgres";

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await sql`create table if not exists _migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const applied = new Set(
    (await sql`select name from _migrations`).map((r) => r.name as string)
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const body = readFileSync(join(dir, file), "utf8");
    console.log(`apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into _migrations (name) values (${file})`;
    });
  }

  await sql.end();
  console.log("migrations complete");
}

main().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
