import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error("Set TURSO_DATABASE_URL before running migrations.");
if (!url.startsWith("file:") && !process.env.TURSO_AUTH_TOKEN) throw new Error("Set TURSO_AUTH_TOKEN for a remote database.");
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  const sql = await readFile(new URL("../db/migrations/0001_accounts_and_billing.sql", import.meta.url), "utf8");
  await client.batch(sql.split("-- statement-breakpoint").map((statement) => statement.trim()).filter(Boolean), "write");
  console.log("Account and billing tables are ready.");
} finally {
  client.close();
}
