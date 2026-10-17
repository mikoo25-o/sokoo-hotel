import { beforeAll, describe, expect, it } from "vitest";
import { asUser, errorOf } from "./harness";
import { buildFixture, one, pay, placeOrder, type Fixture } from "./fixture";

let f: Fixture;
beforeAll(async () => {
  f = await buildFixture();
});

describe("expenses", () => {
  const insert = (who: keyof Fixture["users"], amount = 1500, extra = "") =>
    asUser(f.db, f.users[who], () =>
      errorOf(() => f.db.query(
        `insert into public.expenses (restaurant_id, amount_minor, category, expense_date, description, created_by ${extra ? ", " + extra.split("=")[0] : ""})
         values ($1, $2, 'stock', current_date, 'Onions', $3 ${extra ? ", " + extra.split("=")[1] : ""})`,
        [f.rid, amount, f.users[who]])));

  it("managers record expenses; staff cannot", async () => {
    expect(await insert("manager")).toBeNull();
    for (const who of ["waiter", "kitchen", "cashier"] as const) {
      expect(await insert(who)).toMatch(/row-level security/);
    }
  });

  it("rejects non-positive amounts, impersonated creators and foreign receipt paths", async () => {
    expect(await insert("manager", 0)).toMatch(/check constraint/);
    const spoof = await asUser(f.db, f.users.manager, () =>
      errorOf(() => f.db.query(
        "insert into public.expenses (restaurant_id, amount_minor, category, expense_date, description, created_by) values ($1, 100, 'rent', current_date, 'x', $2)",
        [f.rid, f.users.owner])));
    expect(spoof).toMatch(/row-level security/);
    const path = await asUser(f.db, f.users.manager, () =>
      errorOf(() => f.db.query(
        "insert into public.expenses (restaurant_id, amount_minor, category, expense_date, description, created_by, receipt_path) values ($1, 100, 'rent', current_date, 'x', $2, $3)",
        [f.rid, f.users.manager, `${f.ridB}/receipts/a.webp`])));
    expect(path).toMatch(/row-level security/);
  });

  it("corrections are audited and deletion is impossible; voiding keeps the row", async () => {
    const e = await asUser(f.db, f.users.manager, async () =>
      one<{ id: string }>(f.db,
        "insert into public.expenses (restaurant_id, amount_minor, category, expense_date, description, created_by) values ($1, 2500, 'utilities', current_date, 'Power', $2) returning id",
        [f.rid, f.users.manager]));
    await asUser(f.db, f.users.manager, () => f.db.query("update public.expenses set amount_minor = 2800 where id = $1", [e.id]));
    await asUser(f.db, f.users.manager, () => f.db.query(
      "update public.expenses set voided_at = now(), voided_by = $2, void_reason = 'Entered twice' where id = $1", [e.id, f.users.manager]));
    const del = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("delete from public.expenses where id = $1", [e.id])));
    expect(del).toMatch(/permission denied/);
    const kept = await one<{ n: number }>(f.db, "select count(*)::int as n from public.expenses where id = $1", [e.id]);
    expect(kept.n).toBe(1);
    const actions = (await f.db.query<{ action: string }>(
      "select action from public.audit_logs where entity = 'expense' and entity_id = $1 order by id", [e.id])).rows.map((r) => r.action);
    expect(actions).toEqual(["expense_created", "expense_corrected", "expense_voided"]);
  });
});

describe("subscription restrictions", () => {
  it("a lapsed trial moves to grace, then suspends: read-only but data stays", async () => {
    // Within the trial everything works.
    const ok = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }]);
    expect(ok.id).toBeTruthy();

    // Trial ended 3 days ago, 7 day grace: still writable.
    await f.db.query("update public.subscriptions set trial_ends_at = now() - interval '3 days' where restaurant_id = $1", [f.rid]);
    const grace = await one<{ s: string }>(f.db, "select public.subscription_effective_status($1) as s", [f.rid]);
    expect(grace.s).toBe("grace");
    expect((await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }])).id).toBeTruthy();

    // Past the grace window: suspended.
    await f.db.query("update public.subscriptions set trial_ends_at = now() - interval '30 days' where restaurant_id = $1", [f.rid]);
    const s = await one<{ s: string }>(f.db, "select public.subscription_effective_status($1) as s", [f.rid]);
    expect(s.s).toBe("suspended");

    expect(await errorOf(() => placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }]))).toBe("subscription_inactive");
    const cat = await asUser(f.db, f.users.owner, () =>
      errorOf(() => f.db.query("insert into public.menu_categories (restaurant_id, name) values ($1,'Desserts')", [f.rid])));
    expect(cat).toMatch(/row-level security/);
    const exp = await asUser(f.db, f.users.owner, () =>
      errorOf(() => f.db.query("insert into public.expenses (restaurant_id, amount_minor, category, expense_date, description, created_by) values ($1,100,'rent',current_date,'x',$2)", [f.rid, f.users.owner])));
    expect(exp).toMatch(/row-level security/);
    const staff = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.rotate_join_code($1, 'SOKO5ZZZZZ')", [f.rid])));
    expect(staff).toBe("subscription_inactive");

    // The data is still readable (and therefore exportable).
    const orders = await asUser(f.db, f.users.manager, async () => (await f.db.query("select 1 from public.orders")).rows.length);
    const menu = await asUser(f.db, f.users.waiter, async () => (await f.db.query("select 1 from public.menu_items")).rows.length);
    expect(orders).toBeGreaterThan(0);
    expect(menu).toBeGreaterThan(0);

    // Paying the subscription (done by the operator) restores writes.
    await f.db.query("update public.subscriptions set status = 'active', current_period_end = now() + interval '30 days' where restaurant_id = $1", [f.rid]);
    expect((await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }])).id).toBeTruthy();
    const changes = await one<{ n: number }>(f.db, "select count(*)::int as n from public.audit_logs where action = 'subscription_changed'");
    expect(changes.n).toBeGreaterThanOrEqual(1);
  });

  it("explicit suspended and cancelled states are read-only; past_due keeps working", async () => {
    await f.db.query("update public.subscriptions set status = 'past_due' where restaurant_id = $1", [f.rid]);
    expect((await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }])).id).toBeTruthy();
    for (const s of ["suspended", "cancelled"]) {
      await f.db.query("update public.subscriptions set status = $2::public.sub_status where restaurant_id = $1", [f.rid, s]);
      expect(await errorOf(() => placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }]))).toBe("subscription_inactive");
    }
    await f.db.query("update public.subscriptions set status = 'active', current_period_end = now() + interval '30 days' where restaurant_id = $1", [f.rid]);
  });

  it("managers cannot change their own subscription", async () => {
    const err = await asUser(f.db, f.users.owner, () =>
      errorOf(() => f.db.query("update public.subscriptions set status = 'active' where restaurant_id = $1", [f.rid])));
    expect(err).toMatch(/permission denied/);
    const plans = await asUser(f.db, f.users.owner, () =>
      errorOf(() => f.db.query("insert into public.subscription_plans (code, name, price_minor) values ('free','Free',0)")));
    expect(plans).toMatch(/permission denied/);
  });

  it("subscription plans are data (one standard plan is seeded) and readable by staff", async () => {
    const n = await one<{ n: number }>(f.db, "select count(*)::int as n from public.subscription_plans");
    expect(n.n).toBe(1); // the KSh 3,000 monthly plan from migration 0010
    await f.db.query("insert into public.subscription_plans (code, name, price_minor) values ('starter','Starter',250000)");
    const seen = await asUser(f.db, f.users.waiter, async () => (await f.db.query("select 1 from public.subscription_plans")).rows.length);
    expect(seen).toBe(2);
  });
});

describe("reports", () => {
  it("compute sales, collections, receivables and expenses from real rows", async () => {
    const g = await buildFixture();
    const o1 = await placeOrder(g, "waiter", [{ menu_item_id: g.menu.pilau, quantity: 2 }]); // 700
    const o2 = await placeOrder(g, "waiter", [{ menu_item_id: g.menu.soda, quantity: 1 }]); // 120
    await pay(g, "cashier", o1.id, 70000);
    await pay(g, "cashier", o2.id, 5000, "mpesa", "MNB1234567");
    await asUser(g.db, g.users.manager, () => g.db.query(
      "insert into public.expenses (restaurant_id, amount_minor, category, expense_date, description, created_by) values ($1, 20000, 'stock', current_date, 'Rice', $2)", [g.rid, g.users.manager]));
    const r = await asUser(g.db, g.users.manager, async () =>
      (await one<{ r: any }>(g.db, "select public.report_summary($1, current_date, current_date) as r", [g.rid])).r);
    expect(r.sales_minor).toBe(82000);
    expect(r.orders_count).toBe(2);
    expect(r.collected_minor).toBe(75000);
    expect(r.collected_by_method).toEqual({ cash: 70000, mpesa: 5000 });
    expect(r.receivable_minor).toBe(7000);
    expect(r.receivable_count).toBe(1);
    expect(r.expenses_minor).toBe(20000);
    expect(r.estimated_profit_minor).toBe(62000);
    expect(r.top_items[0]).toMatchObject({ name: "Chicken Pilau", quantity: 2 });
    expect(r.by_category.map((c: any) => c.name).sort()).toEqual(["Drinks", "Main Dishes"]);
    expect(r.daily).toHaveLength(1);
    expect(r.daily[0]).toMatchObject({ sales_minor: 82000, collected_minor: 75000 });

    const act = await asUser(g.db, g.users.manager, async () =>
      (await one<{ a: any[] }>(g.db, "select public.recent_activity($1, 10) as a", [g.rid])).a);
    expect(act.map((x) => x.type).sort()).toEqual(["expense", "order", "order", "payment", "payment"]);
  });

  it("start empty for a new restaurant, with no invented numbers", async () => {
    const r = await asUser(f.db, f.users.outsider, async () =>
      (await one<{ r: any }>(f.db, "select public.report_summary($1, current_date - 6, current_date) as r", [f.ridB])).r);
    expect(r).toMatchObject({ sales_minor: 0, orders_count: 0, collected_minor: 0, receivable_minor: 0, expenses_minor: 0, top_items: [] });
    expect(r.daily).toHaveLength(7);
  });

  it("cancelled orders and reversed payments are excluded", async () => {
    const g = await buildFixture();
    const o = await placeOrder(g, "waiter", [{ menu_item_id: g.menu.pilau, quantity: 1 }]);
    const p = await pay(g, "cashier", o.id, 35000);
    const pid = (await one<{ id: string }>(g.db, "select id from public.payments where receipt_ref = $1", [p.receipt_ref as string])).id;
    await asUser(g.db, g.users.manager, () => g.db.query("select public.reverse_payment($1, 'test reversal')", [pid]));
    const c = await placeOrder(g, "waiter", [{ menu_item_id: g.menu.stew, quantity: 1 }]);
    const item = await one<{ id: string }>(g.db, "select id from public.order_items where order_id = $1", [c.id]);
    await asUser(g.db, g.users.manager, () => g.db.query("select public.set_item_status($1, 'cancelled')", [item.id]));
    const r = await asUser(g.db, g.users.manager, async () =>
      (await one<{ r: any }>(g.db, "select public.report_summary($1, current_date, current_date) as r", [g.rid])).r);
    expect(r.sales_minor).toBe(35000);
    expect(r.collected_minor).toBe(0);
    expect(r.receivable_minor).toBe(35000);
  });

  it("are manager-only, with a sane date range", async () => {
    for (const who of ["waiter", "kitchen", "cashier"] as const) {
      expect(await asUser(f.db, f.users[who], () => errorOf(() => f.db.query("select public.report_summary($1, current_date, current_date)", [f.rid])))).toBe("forbidden");
      expect(await asUser(f.db, f.users[who], () => errorOf(() => f.db.query("select public.recent_activity($1, 5)", [f.rid])))).toBe("forbidden");
    }
    expect(await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.report_summary($1, current_date, current_date - 1)", [f.rid])))).toBe("invalid_range");
    expect(await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.report_summary($1, current_date - 400, current_date)", [f.rid])))).toBe("invalid_range");
  });
});
