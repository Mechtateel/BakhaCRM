import { createClient } from "@libsql/client";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseUrl } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const migrationsDir = path.join(rootDir, "db", "migrations");

await mkdir(path.join(rootDir, "data"), { recursive: true });

const client = createClient({ url: databaseUrl });
await client.execute("PRAGMA foreign_keys = ON");
await client.execute(`
  CREATE TABLE IF NOT EXISTS __migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

for (const file of files) {
  const applied = await client.execute({
    sql: "SELECT filename FROM __migrations WHERE filename = ?",
    args: [file]
  });
  if (applied.rows.length) {
    console.log(`Skipped ${file}`);
    continue;
  }

  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.execute(statement);
  }

  console.log(`Applied ${file}`);
  await client.execute({
    sql: "INSERT INTO __migrations (filename) VALUES (?)",
    args: [file]
  });
}

await client.close();
console.log(`Database ready at ${databaseUrl}`);
