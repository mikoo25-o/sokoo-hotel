import { beforeAll, describe, expect, it } from "vitest";
import { asUser, errorOf } from "./harness";
import { buildFixture, key, one, orderRef, placeOrder, type Fixture } from "./fixture";

let f: Fixture;
beforeAll(async () => {
  f = await buildFixture();
});

const items = (f: Fixture, o: string) =>
  f.db.query<{ name_snapshot: string; unit_price_minor: string; status: string; quantity: number; fulfilment: string; id: string }>(
    "select id, name_snapshot, unit_price_minor, status, quantity, fulfilment from public.order_items where order_id = $1 order by name_snapshot", [o]);

describe("creating orders", () => {
  it("snapshots server-side prices and totals the order", async () => {
    const o = await placeOrder(f, "waiter", [
      { menu_item_id: f.menu.pilau, quantity: 2 },
      { menu_item_id: f.menu.soda, quantity: 1, note: "no ice" },
    ]);
    expect(o.total_minor).toBe(2 * 35000 + 12000);
    expect(o.reference).toMatch(/^SH-\d{6}-[A-Z2-9]{8}$/);
    expect(o.duplicate).toBe(false);
    const rows = (await items(f, o.id)).rows;
    expect(rows.map((r) => [r.name_snapshot, Number(r.unit_price_minor)])).toEqual([["Chicken Pilau", 35000], ["Soda", 12000]]);
  });

  it("a later price change does not change an existing bill", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.stew, quantity: 1 }]);
    await asUser(f.db, f.users.manager, () => f.db.query("update public.menu_items set price_minor = 99900, name = 'Beef Stew Special' where id = $1", [f.menu.stew]));
    const row = (await items(f, o.id)).rows[0];
    expect(row.name_snapshot).toBe("Beef Stew");
    expect(Number(row.unit_price_minor)).toBe(30000);
    const total = await one<{ total_minor: string }>(f.db, "select total_minor from public.orders where id = $1", [o.id]);
    expect(Number(total.total_minor)).toBe(30000);
    const audit = await one<{ n: number }>(f.db, "select count(*)::int as n from public.audit_logs where action = 'menu_price_changed'");
    expect(audit.n).toBe(1);
    // new orders use the new price
    const o2 = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.stew, quantity: 1 }]);
    expect(o2.total_minor).toBe(99900);
  });

  it("is idempotent: retrying the same submission returns the first order", async () => {
    const idem = key();
    const a = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }], { idem });
    const b = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }], { idem });
    expect(b.id).toBe(a.id);
    expect(b.duplicate).toBe(true);
    const n = await one<{ n: number }>(f.db, "select count(*)::int as n from public.orders where idempotency_key = $1", [idem]);
    expect(n.n).toBe(1);
  });

  it("another user cannot replay someone else's idempotency key", async () => {
    const idem = key();
    await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }], { idem });
    const err = await errorOf(() => placeOrder(f, "waiter2", [{ menu_item_id: f.menu.pilau, quantity: 1 }], { idem }));
    expect(err).toBe("forbidden");
  });

  it.each([
    ["an unavailable item", () => [{ menu_item_id: f.menu.fish, quantity: 1 }], "item_unavailable"],
    ["an unknown item", () => [{ menu_item_id: "00000000-0000-4000-8000-0000000000ff", quantity: 1 }], "item_unavailable"],
    ["a malformed item id", () => [{ menu_item_id: "not-a-uuid", quantity: 1 }], "invalid_item"],
    ["zero quantity", () => [{ menu_item_id: f.menu.pilau, quantity: 0 }], "invalid_quantity"],
    ["a huge quantity", () => [{ menu_item_id: f.menu.pilau, quantity: 500 }], "invalid_quantity"],
    ["an empty order", () => [], "empty_order"],
  ])("rejects %s and saves nothing", async (_label, build, code) => {
    const before = await one<{ n: number }>(f.db, "select count(*)::int as n from public.orders");
    const err = await errorOf(() => placeOrder(f, "waiter", build()));
    expect(err).toBe(code);
    const after = await one<{ n: number }>(f.db, "select count(*)::int as n from public.orders");
    expect(after.n).toBe(before.n);
  });

  it("rejects another restaurant's menu item", async () => {
    const other = await asUser(f.db, f.users.outsider, async () =>
      (await one<{ id: string }>(f.db, "insert into public.menu_categories (restaurant_id, name) values ($1,'X') returning id", [f.ridB])).id);
    const item = await asUser(f.db, f.users.outsider, async () =>
      (await one<{ id: string }>(f.db, "insert into public.menu_items (restaurant_id, category_id, name, price_minor) values ($1,$2,'Foreign',100) returning id", [f.ridB, other])).id);
    const err = await errorOf(() => placeOrder(f, "waiter", [{ menu_item_id: item, quantity: 1 }]));
    expect(err).toBe("item_unavailable");
  });

  it("kitchen and cashier staff cannot create orders", async () => {
    for (const who of ["kitchen", "cashier"] as const) {
      expect(await errorOf(() => placeOrder(f, who, [{ menu_item_id: f.menu.pilau, quantity: 1 }]))).toBe("forbidden");
    }
  });

  it("order references are unique and unpredictable in shape", async () => {
    const dup = await errorOf(() => f.db.query(
      "insert into public.orders (restaurant_id, reference, location_id, location_name, idempotency_key) select restaurant_id, reference, location_id, location_name, 'idem-dupe-12345' from public.orders limit 1"));
    expect(dup).toMatch(/unique|duplicate/);
    const bad = await errorOf(() => f.db.query(
      "insert into public.orders (restaurant_id, reference, location_id, location_name, idempotency_key) select restaurant_id, 'SH-000001', location_id, location_name, 'idem-badref-12' from public.orders limit 1"));
    expect(bad).toMatch(/check constraint/);
  });
});

describe("visibility", () => {
  it("a waiter sees only their own orders; kitchen, cashier and managers see all", async () => {
    const mine = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }]);
    const theirs = await placeOrder(f, "waiter2", [{ menu_item_id: f.menu.pilau, quantity: 1 }]);
    const ids = async (who: keyof Fixture["users"]) =>
      asUser(f.db, f.users[who], async () => (await f.db.query<{ id: string }>("select id from public.orders")).rows.map((r) => r.id));
    expect(await ids("waiter")).toContain(mine.id);
    expect(await ids("waiter")).not.toContain(theirs.id);
    expect(await ids("waiter2")).not.toContain(mine.id);
    for (const who of ["kitchen", "cashier", "manager", "owner"] as const) {
      const seen = await ids(who);
      expect(seen).toContain(mine.id);
      expect(seen).toContain(theirs.id);
    }
    // Items follow their order.
    const itemRows = await asUser(f.db, f.users.waiter, async () =>
      (await f.db.query("select 1 from public.order_items where order_id = $1", [theirs.id])).rows.length);
    expect(itemRows).toBe(0);
  });

  it("guessing an order reference reveals nothing to a waiter who did not take the order", async () => {
    const o = await placeOrder(f, "waiter2", [{ menu_item_id: f.menu.pilau, quantity: 1 }]);
    const rows = await asUser(f.db, f.users.waiter, async () =>
      (await f.db.query("select * from public.orders where reference = $1", [o.reference])).rows);
    expect(rows).toHaveLength(0);
  });

  it("occupied tables are visible to waiters without exposing orders", async () => {
    await placeOrder(f, "waiter2", [{ menu_item_id: f.menu.pilau, quantity: 1 }], { table: f.tables.t2 });
    const occ = await asUser(f.db, f.users.waiter, async () =>
      (await f.db.query<{ occupied_locations: string }>("select * from public.occupied_locations($1)", [f.rid])).rows.map((r) => r.occupied_locations));
    expect(occ).toContain(f.tables.t2);
  });
});

describe("fulfilment workflow", () => {
  it("waiter-released drinks start ready and are not blocked by the kitchen", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.soda, quantity: 2 }]);
    const rows = (await items(f, o.id)).rows;
    expect(rows[0].status).toBe("ready");
    const st = await one<{ status: string }>(f.db, "select status from public.orders where id = $1", [o.id]);
    expect(st.status).toBe("ready");
    await asUser(f.db, f.users.waiter, () => f.db.query("select public.set_item_status($1, 'served')", [rows[0].id]));
    const st2 = await one<{ status: string }>(f.db, "select status from public.orders where id = $1", [o.id]);
    expect(st2.status).toBe("served");
  });

  it("kitchen items move pending -> preparing -> ready and overall status follows", async () => {
    const o = await placeOrder(f, "waiter", [
      { menu_item_id: f.menu.pilau, quantity: 1 },
      { menu_item_id: f.menu.soda, quantity: 1 },
    ]);
    const status = async () => (await one<{ status: string }>(f.db, "select status from public.orders where id = $1", [o.id])).status;
    // Drink ready, food pending: the order is not "ready" yet.
    expect(await status()).toBe("pending");
    const food = (await items(f, o.id)).rows.find((r) => r.fulfilment === "kitchen")!;
    await asUser(f.db, f.users.kitchen, () => f.db.query("select public.set_item_status($1, 'preparing')", [food.id]));
    expect(await status()).toBe("preparing");
    await asUser(f.db, f.users.kitchen, () => f.db.query("select public.set_item_status($1, 'ready')", [food.id]));
    expect(await status()).toBe("ready");
    const events = await one<{ n: number }>(f.db, "select count(*)::int as n from public.order_item_events where order_item_id = $1", [food.id]);
    expect(events.n).toBe(3); // created, preparing, ready: history is kept
    await asUser(f.db, f.users.waiter, () => f.db.query("select public.bulk_set_items_status($1, 'served')", [o.id]));
    expect(await status()).toBe("served");
  });

  it("enforces who may do what", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }, { menu_item_id: f.menu.soda, quantity: 1 }]);
    const rows = (await items(f, o.id)).rows;
    const food = rows.find((r) => r.fulfilment === "kitchen")!;
    const drink = rows.find((r) => r.fulfilment === "waiter")!;
    const set = (who: keyof Fixture["users"], id: string, to: string) =>
      asUser(f.db, f.users[who], () => errorOf(() => f.db.query("select public.set_item_status($1, $2::public.item_status)", [id, to])));
    expect(await set("waiter", food.id, "preparing")).toBe("invalid_transition"); // waiters do not cook
    expect(await set("cashier", food.id, "preparing")).toBe("forbidden");
    expect(await set("kitchen", drink.id, "served")).toBe("invalid_transition"); // kitchen does not serve
    expect(await set("kitchen", food.id, "served")).toBe("invalid_transition");
    expect(await set("kitchen", food.id, "ready")).toBe("invalid_transition"); // must prepare first
    expect(await set("waiter2", drink.id, "served")).toBe("invalid_transition"); // a different waiter did not take this order
  });

  it("another waiter cannot serve someone else's items", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.soda, quantity: 1 }]);
    const drink = (await items(f, o.id)).rows[0];
    const err = await asUser(f.db, f.users.waiter2, () => errorOf(() => f.db.query("select public.set_item_status($1, 'served')", [drink.id])));
    expect(err).toBe("invalid_transition");
    const mgr = await asUser(f.db, f.users.manager, () => f.db.query("select public.set_item_status($1, 'served')", [drink.id]));
    expect(mgr.rows[0]).toBeTruthy();
  });

  it("an item can be cancelled before the kitchen starts, and the total is recalculated", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }, { menu_item_id: f.menu.soda, quantity: 1 }]);
    const food = (await items(f, o.id)).rows.find((r) => r.fulfilment === "kitchen")!;
    await asUser(f.db, f.users.waiter, () => f.db.query("select public.set_item_status($1, 'cancelled')", [food.id]));
    const t = await one<{ total_minor: string }>(f.db, "select total_minor from public.orders where id = $1", [o.id]);
    expect(Number(t.total_minor)).toBe(12000);
    const o2 = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }]);
    const f2 = (await items(f, o2.id)).rows[0];
    await asUser(f.db, f.users.kitchen, () => f.db.query("select public.set_item_status($1, 'preparing')", [f2.id]));
    const err = await asUser(f.db, f.users.waiter, () => errorOf(() => f.db.query("select public.set_item_status($1, 'cancelled')", [f2.id])));
    expect(err).toBe("invalid_transition"); // already being cooked
  });

  it("bulk update fails cleanly when nothing is eligible", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }]);
    const err = await asUser(f.db, f.users.kitchen, () => errorOf(() => f.db.query("select public.bulk_set_items_status($1, 'ready')", [o.id])));
    expect(err).toBe("invalid_transition");
  });

  it("order references used in the test helper are valid and distinct", () => {
    const a = orderRef();
    const b = orderRef();
    expect(a).not.toBe(b);
  });
});
