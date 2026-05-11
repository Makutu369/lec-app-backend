import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";
import * as relations from "./relations";

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, { schema: { ...schema, ...relations } });
}

export type Db = ReturnType<typeof createDb>;
