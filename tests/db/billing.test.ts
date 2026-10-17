import { beforeAll, describe, expect, it } from "vitest";
import { asUser, errorOf } from "./harness";
import { buildFixture, one, placeOrder, type Fixture } from "./fixture";

let f: Fixture;
let planId: string;
let freePlanId: string;
beforeAll(async () => {
  f = await buildFixture();
  // The standard plan comes from migration 0010.
  planId = (await one<{ id: string }>(f.db, "select id from public.subscription_plans where code = 'monthly'")).id;
  freePlanId = (await one<{ id: string }>(f.db,
    "insert into public.subscription_plans (code, name, price_minor, billing_interval) values ('free','Free',0,'month') returning id")).id;
});

const PHONE = "254712345678";
const start = (who: keyof Fixture["users"], rid = f.rid, plan = planId, phone = PHONE, periods = 1) =>
  asUser(f.db, f.users[who], async () =>
    (await one<{ r: { id: string; amount_minor: number } }>(f.db, "select public.start_subscription_payment($1,$2,$3,$4) as r", [rid, plan, phone, periods])).r);
const asService = async <T>(fn: () => Promise<T>) => {
  await f.db.exec("reset role");
  await f.db.exec("set role service_role");
  try { return await fn(); } finally { await f.db.exec("reset role"); }
};
const init = (id: string, checkout: string) =>
  asService(() => f.db.query("select public.record_stk_initiated($1,$2,'m')", [id, checkout]));
const apply = (checkout: string, code: number, receipt: string | null, amount: number | null) =>
  asService(async () => (await one<{ r: string }>(f.db, "select public.apply_subscription_payment($1,$2,'x',$3,$4) as r", [checkout, code, receipt, amount])).r);
const sub = () => one<{ status: string; current_period_end: string | null; trial_ends_at: string | null }>(f.db, "select status, current_period_end, trial_ends_at from public.subscriptions where restaurant_id = $1", [f.rid]);
const settle = async (id: string) => { await f.db.query("update public.subscription_payments set status='expired' where id=$1", [id]); };

describe("the standard plan", () => {
  it("is KSh 3,000 per month", async () => {
    const p = await one<{ price_minor: string; billing_interval: string }>(f.db, "select price_minor, billing_interval from public.subscription_plans where id=$1", [planId]);
    expect(Number(p.price_minor)).toBe(300000);
    expect(p.billing_interval).toBe("month");
  });
});

describe("starting a subscription payment", () => {
  it("lets only a manager or owner start one", async () => {
    expect(await errorOf(() => start("waiter"))).toMatch(/forbidden/);
    expect(await errorOf(() => start("cashier"))).toMatch(/forbidden/);
    expect(await errorOf(() => start("outsider"))).toMatch(/forbidden/);
  });

  it("takes the amount from the plan, not from the caller", async () => {
    const r = await start("manager", f.rid, planId, PHONE, 3);
    expect(Number(r.amount_minor)).toBe(900000);
    await settle(r.id);
  });

  it("rejects bad phones, bad periods, free or unknown plans", async () => {
    expect(await errorOf(() => start("owner", f.rid, planId, "0712345678"))).toMatch(/invalid_phone/);
    expect(await errorOf(() => start("owner", f.rid, planId, PHONE, 0))).toMatch(/invalid_quantity/);
    expect(await errorOf(() => start("owner", f.rid, planId, PHONE, 13))).toMatch(/invalid_quantity/);
    expect(await errorOf(() => start("owner", f.rid, freePlanId))).toMatch(/invalid_amount/);
    expect(await errorOf(() => start("owner", f.rid, "00000000-0000-4000-8000-0000000fffff"))).toMatch(/not_found/);
  });

  it("blocks a second prompt while one is in progress", async () => {
    const a = await start("owner");
    expect(await errorOf(() => start("manager"))).toMatch(/payment_in_progress/);
    await settle(a.id);
  });

  it("cannot be started for another restaurant", async () => {
    expect(await errorOf(() => start("owner", f.ridB))).toMatch(/forbidden/);
  });
});

describe("who can see and settle payments", () => {
  it("hides payments from staff and other restaurants, and shows them to managers", async () => {
    const a = await start("owner");
    const count = (who: keyof Fixture["users"]) =>
      asUser(f.db, f.users[who], async () => Number((await one<{ n: string }>(f.db, "select count(*) n from public.subscription_payments")).n));
    expect(await count("waiter")).toBe(0);
    expect(await count("outsider")).toBe(0);
    expect(await count("manager")).toBeGreaterThan(0);
    await settle(a.id);
  });

  it("refuses the settling functions to signed-in users", async () => {
    for (const sql of [
      "select public.apply_subscription_payment('x',0,'x','R',100)",
      "select public.record_stk_initiated(gen_random_uuid(),'x','y')",
      "select public.fail_subscription_payment(gen_random_uuid(),'x')",
    ]) {
      expect(await errorOf(() => asUser(f.db, f.users.owner, () => f.db.query(sql)))).toMatch(/permission denied/);
    }
  });
});

describe("applying a payment", () => {
  it("extends from the trial end, once, and ignores repeats", async () => {
    const before = await sub();
    const p = await start("owner");
    await init(p.id, "ws_CO_1");
    expect(await apply("ws_CO_1", 0, "QAA1111111", 3000_00)).toBe("applied");
    const after = await sub();
    expect(after.status).toBe("active");
    expect(new Date(after.current_period_end!).getTime()).toBeGreaterThan(new Date(before.trial_ends_at!).getTime());
    expect(await apply("ws_CO_1", 0, "QAA1111111", 3000_00)).toBe("duplicate");
    expect(new Date((await sub()).current_period_end!).getTime()).toBe(new Date(after.current_period_end!).getTime());
  });

  it("adds to an active period instead of replacing it", async () => {
    const before = new Date((await sub()).current_period_end!).getTime();
    const p = await start("owner");
    await init(p.id, "ws_CO_2");
    expect(await apply("ws_CO_2", 0, "QAA2222222", 3000_00)).toBe("applied");
    const after = new Date((await sub()).current_period_end!).getTime();
    expect(after - before).toBeGreaterThan(27 * 86400_000);
  });

  it("records a cancelled prompt without changing the subscription", async () => {
    const before = await sub();
    const p = await start("owner");
    await init(p.id, "ws_CO_3");
    expect(await apply("ws_CO_3", 1032, null, null)).toBe("failed");
    expect(JSON.stringify(await sub())).toBe(JSON.stringify(before));
    expect((await one<{ status: string }>(f.db, "select status from public.subscription_payments where id=$1", [p.id])).status).toBe("cancelled");
  });

  it("rejects a mismatched amount and leaves the subscription alone", async () => {
    const before = await sub();
    const p = await start("owner");
    await init(p.id, "ws_CO_4");
    expect(await apply("ws_CO_4", 0, "QAA4444444", 100)).toBe("amount_mismatch");
    expect(JSON.stringify(await sub())).toBe(JSON.stringify(before));
    expect(await apply("ws_CO_4", 0, "QAA4444444", 3000_00)).toBe("duplicate");
  });

  it("returns unknown for an unrecognised checkout id", async () => {
    expect(await apply("nope", 0, "QAA5555555", 3000_00)).toBe("unknown");
  });

  it("never reuses an M-Pesa receipt", async () => {
    const p = await start("owner");
    await init(p.id, "ws_CO_6");
    expect(await errorOf(() => apply("ws_CO_6", 0, "QAA1111111", 3000_00))).toMatch(/unique|duplicate/i);
  });

  it("leaves the other restaurant untouched", async () => {
    const other = await one<{ status: string; plan_id: string | null }>(f.db, "select status, plan_id from public.subscriptions where restaurant_id=$1", [f.ridB]);
    expect(other.status).toBe("trial");
    expect(other.plan_id).toBeNull();
  });
});

describe("ordering is never blocked by table occupancy", () => {
  it("accepts several orders on the same table", async () => {
    const a = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }], { table: f.tables.t2 });
    const b = await placeOrder(f, "waiter2", [{ menu_item_id: f.menu.stew, quantity: 1 }], { table: f.tables.t2 });
    expect(a.id).not.toBe(b.id);
  });
});
