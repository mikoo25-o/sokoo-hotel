import { beforeAll, describe, expect, it } from "vitest";
import { asUser, errorOf } from "./harness";
import { buildFixture, one, pay, placeOrder, type Fixture } from "./fixture";

let f: Fixture;
beforeAll(async () => {
  f = await buildFixture();
  const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }]);
  await pay(f, "cashier", o.id, 10000);
  await asUser(f.db, f.users.owner, () =>
    f.db.query(
      "insert into public.expenses (restaurant_id, amount_minor, category, expense_date, description, created_by) values ($1, 5000, 'stock', current_date, 'Tomatoes', $2)",
      [f.rid, f.users.owner],
    ),
  );
});

const tables = ["menu_categories", "menu_items", "service_locations", "orders", "order_items", "payments", "expenses", "audit_logs", "memberships", "subscriptions", "join_requests"];

describe("tenant isolation", () => {
  it.each(tables)("a user from restaurant B cannot read restaurant A's %s", async (t) => {
    const rows = await asUser(f.db, f.users.outsider, async () =>
      (await f.db.query(`select 1 from public.${t} where restaurant_id = $1`, [f.rid])).rows);
    expect(rows).toHaveLength(0);
  });

  it("restaurant B cannot see restaurant A at all", async () => {
    const rows = await asUser(f.db, f.users.outsider, async () =>
      (await f.db.query("select id from public.restaurants where id = $1", [f.rid])).rows);
    expect(rows).toHaveLength(0);
  });

  it("a user with no membership sees nothing", async () => {
    const rows = await asUser(f.db, f.users.stranger, async () =>
      (await f.db.query("select 1 from public.menu_items")).rows);
    expect(rows).toHaveLength(0);
  });

  it("an outsider cannot write into another restaurant's menu", async () => {
    const err = await asUser(f.db, f.users.outsider, () =>
      errorOf(() => f.db.query(
        "insert into public.menu_categories (restaurant_id, name) values ($1, 'Injected')", [f.rid])));
    expect(err).toMatch(/row-level security/);
  });

  it("an outsider cannot create orders, take payments or manage staff in another restaurant", async () => {
    const e1 = await asUser(f.db, f.users.outsider, () =>
      errorOf(() => f.db.query("select public.create_order($1,'SH-261015-AAAAAAAA',$2,$3::jsonb,'idem-outsider-1')",
        [f.rid, f.tables.t1, JSON.stringify([{ menu_item_id: f.menu.pilau, quantity: 1 }])])));
    expect(e1).toBe("forbidden");
    const order = await one<{ id: string }>(f.db, "select id from public.orders limit 1");
    const e2 = await asUser(f.db, f.users.outsider, () =>
      errorOf(() => f.db.query("select public.record_payment($1, 100, 'cash', null, 'RC-261015-AAAAAAAA', 'idem-outsider-2')", [order.id])));
    expect(e2).toBe("forbidden");
    const e3 = await asUser(f.db, f.users.outsider, () =>
      errorOf(() => f.db.query("select public.report_summary($1, current_date, current_date)", [f.rid])));
    expect(e3).toBe("forbidden");
    const e4 = await asUser(f.db, f.users.outsider, () =>
      errorOf(() => f.db.query("select public.get_join_code($1)", [f.rid])));
    expect(e4).toBe("forbidden");
  });

  it("an anonymous caller has no access to tenant tables or RPCs", async () => {
    await f.db.exec("reset role");
    await f.db.exec("set role anon");
    const err = await errorOf(() => f.db.query("select * from public.orders"));
    await f.db.exec("reset role");
    expect(err).toMatch(/permission denied/);
  });

  it("a staff member of A cannot be used to reach B's data", async () => {
    const rows = await asUser(f.db, f.users.manager, async () =>
      (await f.db.query("select 1 from public.menu_items where restaurant_id = $1", [f.ridB])).rows);
    expect(rows).toHaveLength(0);
  });
});

describe("role boundaries", () => {
  it("only managers can read expenses and the audit log", async () => {
    for (const who of ["waiter", "kitchen", "cashier"] as const) {
      const r = await asUser(f.db, f.users[who], async () => ({
        expenses: (await f.db.query("select 1 from public.expenses")).rows.length,
        audit: (await f.db.query("select 1 from public.audit_logs")).rows.length,
      }));
      expect(r).toEqual({ expenses: 0, audit: 0 });
    }
    const m = await asUser(f.db, f.users.manager, async () =>
      (await f.db.query("select 1 from public.expenses")).rows.length);
    expect(m).toBe(1);
  });

  it("waiters and kitchen cannot read payments; cashiers can", async () => {
    const count = async (who: keyof Fixture["users"]) =>
      asUser(f.db, f.users[who], async () => (await f.db.query("select 1 from public.payments")).rows.length);
    expect(await count("waiter")).toBe(0);
    expect(await count("kitchen")).toBe(0);
    expect(await count("cashier")).toBe(1);
  });

  it("waiters cannot change the menu, locations or settings", async () => {
    const e1 = await asUser(f.db, f.users.waiter, () =>
      errorOf(() => f.db.query("update public.menu_items set price_minor = 1 where restaurant_id = $1", [f.rid])));
    // RLS makes the update match zero rows rather than error: verify nothing changed.
    expect(e1).toBeNull();
    const p = await one<{ price_minor: string }>(f.db, "select price_minor from public.menu_items where id = $1", [f.menu.pilau]);
    expect(Number(p.price_minor)).toBe(35000);
    const e2 = await asUser(f.db, f.users.waiter, () =>
      errorOf(() => f.db.query("insert into public.service_locations (restaurant_id, name) values ($1, 'Hacked')", [f.rid])));
    expect(e2).toMatch(/row-level security/);
    const e3 = await asUser(f.db, f.users.waiter, () =>
      errorOf(() => f.db.query("update public.restaurants set name = 'Mine' where id = $1", [f.rid])));
    expect(e3).toBeNull();
    const r = await one<{ name: string }>(f.db, "select name from public.restaurants where id = $1", [f.rid]);
    expect(r.name).toBe("Sunrise Restaurant");
  });

  it("the join code column cannot be read directly, even by the owner", async () => {
    const err = await asUser(f.db, f.users.owner, () =>
      errorOf(() => f.db.query("select join_code from public.restaurants")));
    expect(err).toMatch(/permission denied/);
  });

  it("managers read the join code through the audited RPC; waiters cannot", async () => {
    const code = await asUser(f.db, f.users.manager, async () =>
      (await one<{ c: string }>(f.db, "select public.get_join_code($1) as c", [f.rid])).c);
    expect(code).toBe("SOKO2ABCDE");
    const err = await asUser(f.db, f.users.waiter, () =>
      errorOf(() => f.db.query("select public.get_join_code($1)", [f.rid])));
    expect(err).toBe("forbidden");
  });

  it("users cannot edit memberships or write audit entries directly", async () => {
    const e1 = await asUser(f.db, f.users.waiter, () =>
      errorOf(() => f.db.query("update public.memberships set role = 'owner' where user_id = $1", [f.users.waiter])));
    expect(e1).toMatch(/permission denied/);
    const e2 = await asUser(f.db, f.users.manager, () =>
      errorOf(() => f.db.query("insert into public.audit_logs (restaurant_id, action, entity) values ($1,'x','y')", [f.rid])));
    expect(e2).toMatch(/permission denied/);
    const e3 = await asUser(f.db, f.users.manager, () =>
      errorOf(() => f.db.query("select public.write_audit($1,'x','y',null,'{}'::jsonb)", [f.rid])));
    expect(e3).toMatch(/permission denied/);
  });

  it("profiles are private to the owner except for managers of a shared restaurant", async () => {
    const waiterSees = await asUser(f.db, f.users.waiter, async () =>
      (await f.db.query("select id from public.profiles")).rows.map((r) => (r as { id: string }).id));
    expect(waiterSees).toEqual([f.users.waiter]);
    const managerSees = await asUser(f.db, f.users.manager, async () =>
      (await f.db.query("select id from public.profiles")).rows.length);
    expect(managerSees).toBeGreaterThanOrEqual(6);
    const outsiderSeesA = await asUser(f.db, f.users.outsider, async () =>
      (await f.db.query("select id from public.profiles where id = $1", [f.users.waiter])).rows.length);
    expect(outsiderSeesA).toBe(0);
  });
});

describe("storage policies", () => {
  const insertObject = (f: Fixture, who: keyof Fixture["users"], bucket: string, path: string) =>
    asUser(f.db, f.users[who], () =>
      errorOf(() => f.db.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, path])));

  it("managers can upload into their own restaurant folder only", async () => {
    expect(await insertObject(f, "manager", "menu-images", `${f.rid}/menu/a.webp`)).toBeNull();
    expect(await insertObject(f, "manager", "menu-images", `${f.ridB}/menu/a.webp`)).toMatch(/row-level security/);
    expect(await insertObject(f, "outsider", "menu-images", `${f.rid}/menu/b.webp`)).toMatch(/row-level security/);
  });

  it("waiters can view menu photos but not upload them", async () => {
    expect(await insertObject(f, "waiter", "menu-images", `${f.rid}/menu/c.webp`)).toMatch(/row-level security/);
    const visible = await asUser(f.db, f.users.waiter, async () =>
      (await f.db.query("select 1 from storage.objects where bucket_id = 'menu-images'")).rows.length);
    expect(visible).toBe(1);
    const other = await asUser(f.db, f.users.outsider, async () =>
      (await f.db.query("select 1 from storage.objects where bucket_id = 'menu-images'")).rows.length);
    expect(other).toBe(0);
  });

  it("expense receipts are manager only", async () => {
    expect(await insertObject(f, "manager", "expense-receipts", `${f.rid}/receipts/r.webp`)).toBeNull();
    expect(await insertObject(f, "cashier", "expense-receipts", `${f.rid}/receipts/x.webp`)).toMatch(/row-level security/);
    const cashierSees = await asUser(f.db, f.users.cashier, async () =>
      (await f.db.query("select 1 from storage.objects where bucket_id = 'expense-receipts'")).rows.length);
    expect(cashierSees).toBe(0);
  });

  it("a menu item cannot point at another restaurant's image path", async () => {
    const err = await asUser(f.db, f.users.owner, () =>
      errorOf(() => f.db.query("update public.menu_items set image_path = $1 where id = $2", [`${f.ridB}/menu/z.webp`, f.menu.pilau])));
    expect(err).toMatch(/row-level security/);
  });
});
