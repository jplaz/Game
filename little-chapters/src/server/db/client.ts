import postgres from "postgres";
import { env } from "@/server/env";

/**
 * Shared Postgres client (porsager/postgres).
 *
 * The web tier and worker both use this. Connections are service-level; row
 * authorization is enforced by the authz layer on every domain call, with
 * RLS as the backstop for any non-service connection (see 0006_rls.sql).
 */
declare global {
  // eslint-disable-next-line no-var
  var __lc_sql: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  if (!globalThis.__lc_sql) {
    globalThis.__lc_sql = postgres(env().DATABASE_URL, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
      // never log queries (they can embed family content in parameters)
      debug: false,
      onnotice: () => {},
    });
  }
  return globalThis.__lc_sql;
}

export type Sql = ReturnType<typeof getSql>;

export async function closeSql(): Promise<void> {
  if (globalThis.__lc_sql) {
    await globalThis.__lc_sql.end({ timeout: 5 });
    globalThis.__lc_sql = undefined;
  }
}
