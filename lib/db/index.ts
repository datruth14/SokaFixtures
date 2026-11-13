import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

let client: Client | undefined;

export function databaseClient(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not configured.");
  if (!url.startsWith("file:") && !process.env.TURSO_AUTH_TOKEN) throw new Error("TURSO_AUTH_TOKEN is not configured.");
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

export function database() {
  return drizzle(databaseClient(), { schema });
}
