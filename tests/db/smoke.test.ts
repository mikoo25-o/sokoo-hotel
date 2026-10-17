import { describe, expect, it } from "vitest";
import { createDb } from "./harness";

describe("migrations", () => {
  it("apply cleanly on a fresh database", async () => {
    const db = await createDb();
    const r = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_tables where schemaname = 'public'",
    );
    expect(r.rows[0].count).toBeGreaterThanOrEqual(15);
  });

  it("enable row level security on every public table", async () => {
    const db = await createDb();
    const r = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity",
    );
    expect(r.rows).toEqual([]);
  });
});
