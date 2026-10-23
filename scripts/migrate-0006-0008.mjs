// Applies migrations 0006 (push notifications), 0007 (branches) and 0008
// (seed branches) to the database in .dev.vars DATABASE_URL, in one
// transaction: all or nothing. Refuses to run if any of it is already there.
//
//   node scripts/migrate-0006-0008.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = fs.readFileSync(path.join(root, ".dev.vars"), "utf8").match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!url) throw new Error("DATABASE_URL not found in .dev.vars");
const sql = neon(url);

const tables = await sql`select table_name from information_schema.tables where table_schema='public'
  and table_name in ('push_tokens','notifications','push_tickets','branches')`;
const cols = await sql`select table_name, column_name from information_schema.columns
  where (table_name='users' and column_name in ('notifyReminders','branch'))
     or (table_name='mega_centers' and column_name='branchId')`;
if (tables.length || cols.length) {
  console.log("ABORT: migrations 0006-0008 are already (partly) applied. Nothing changed.");
  console.log([...tables.map((t) => t.table_name), ...cols.map((c) => `${c.table_name}.${c.column_name}`)]);
  process.exit(1);
}

console.log("Before:");
console.table(await sql`select (select count(*) from users)::int users, (select count(*) from mega_centers)::int mega_centers`);

const stmts = ["0006_push_notifications", "0007_branches", "0008_seed_branches"].flatMap((f) =>
  fs.readFileSync(path.join(root, "drizzle", `${f}.sql`), "utf8")
    .split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)
);
console.log(`Applying ${stmts.length} statements in one transaction...`);
await sql.transaction(stmts.map((s) => sql.query(s)));

console.log("After (expect 90 branches, every mega center in Alpha, users with a mega center have a branch):");
console.table(await sql`select (select count(*) from branches)::int branches,
  (select count(*) from mega_centers where "branchId"='6a820d3f41be06fb8a276912')::int mcs_in_alpha,
  (select count(*) from mega_centers)::int mcs_total,
  (select count(*) from users where branch is not null)::int users_with_branch,
  (select count(*) from users)::int users_total`);
console.log("Done. Next: npm run deploy");
