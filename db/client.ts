import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sqlitePath = path.join(rootDir, "data", "bakha-crm.sqlite").replaceAll("\\", "/");

export const databaseUrl = process.env.DATABASE_URL ?? `file:${sqlitePath}`;

export function createDb() {
  const client = createClient({ url: databaseUrl });
  return drizzle(client, { schema });
}

export type BakhaDb = ReturnType<typeof createDb>;
