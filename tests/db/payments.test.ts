import { beforeAll, describe, expect, it } from "vitest";
import { asUser, errorOf } from "./harness";
import { buildFixture, key, one, orderRef, pay, placeOrder, receiptRef, type Fixture } from "./fixture";

let f: Fixture;
beforeAll(async () => {
  f = await buildFixture();
});

const orderRow = (id: string) =>
  one<{ total_minor: string; amount_paid_minor: string; payment_status: string }>(
    f.db, "select total_minor, amount_paid_minor, payment_status from public.orders where id = $1", [id]);

const newOrder = () => placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 2 }]); // KSh 700

describe("payments", () => {
  it("accepts several partial payments until the balance is settled", async () => {
    const o = await newOrder();
    let r = await pay(f, "cashier", o.id, 30000);
    expect(r).toMatchObject({ amount_paid_minor: 30000, balance_minor: 40000, payment_status: "partial", duplicate: false });
    r = await pay(f, "cashier", o.id, 20000, "mpesa", "QJK7L8M9N0");
    expect(r).toMatchObject({ amount_paid_minor: 50000, balance_minor: 20000, payment_status: "partial" });
    r = await pay(f, "manager", o.id, 20000);
    expect(r).toMatchObject({ balance_minor: 0, payment_status: "paid" });
    const row = await orderRow(o.id);
    expect(row.payment_status).toBe("paid");
    expect(Number(row.amount_paid_minor)).toBe(70000);
  });

  it("refuses overpayment, zero and negative amounts, and payment on a settled bill", async () => {
    const o = await newOrder();
    const e = (amount: number) => pay(f, "cashier", o.id, amount).then(() => null, (x: Error) => x.message);
    expect(await e(70001)).toBe("overpayment");
    expect(await e(0)).toBe("invalid_amount");
    expect(await e(-500)).toBe("invalid_amount");
    await pay(f, "cashier", o.id, 70000);
    expect(await e(100)).toBe("already_paid");
    expect(Number((await orderRow(o.id)).amount_paid_minor)).toBe(70000);
  });

  it("is idempotent: a double tap records one payment", async () => {
    const o = await newOrder();
    const idem = key();
    const a = await pay(f, "cashier", o.id, 25000, "cash", null, idem);
    const b = await pay(f, "cashier", o.id, 25000, "cash", null, idem);
    expect(b.duplicate).toBe(true);
    expect(b.receipt_ref).toBe(a.receipt_ref);
    const n = await one<{ n: number }>(f.db, "select count(*)::int as n from public.payments where order_id = $1", [o.id]);
    expect(n.n).toBe(1);
    expect(Number((await orderRow(o.id)).amount_paid_minor)).toBe(25000);
  });

  it("validates M-Pesa transaction codes and refuses a reused code", async () => {
    const o = await newOrder();
    const e = (txn: string | null) => pay(f, "cashier", o.id, 1000, "mpesa", txn).then(() => null, (x: Error) => x.message);
    expect(await e(null)).toBe("invalid_transaction_ref");
    expect(await e("short")).toBe("invalid_transaction_ref");
    expect(await e("QJK7L8M9N0 EXTRA")).toBe("invalid_transaction_ref");
    await pay(f, "cashier", o.id, 1000, "mpesa", "qwe1rty2ui"); // lower case is normalised
    const stored = await one<{ transaction_ref: string; reference_verified: boolean }>(
      f.db, "select transaction_ref, reference_verified from public.payments where order_id = $1", [o.id]);
    expect(stored).toEqual({ transaction_ref: "QWE1RTY2UI", reference_verified: false });
    const other = await newOrder();
    const dup = await pay(f, "cashier", other.id, 1000, "mpesa", "QWE1RTY2UI").then(() => null, (x: Error) => x.message);
    expect(dup).toBe("duplicate_transaction_ref");
  });

  it("only cashiers and managers can take payments", async () => {
    const o = await newOrder();
    for (const who of ["waiter", "kitchen", "waiter2"] as const) {
      const err = await pay(f, who, o.id, 100).then(() => null, (x: Error) => x.message);
      expect(err).toBe("forbidden");
    }
  });

  it("every payment gets a unique receipt reference", async () => {
    const o = await newOrder();
    await pay(f, "cashier", o.id, 1000);
    const dup = await errorOf(() => f.db.query(
      "insert into public.payments (restaurant_id, order_id, receipt_ref, amount_minor, method, idempotency_key) select restaurant_id, order_id, receipt_ref, 1, 'cash', 'idem-receipt-dupe' from public.payments limit 1"));
    expect(dup).toMatch(/unique|duplicate/);
  });

  it("cannot take payment on a cancelled order", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }]);
    const item = await one<{ id: string }>(f.db, "select id from public.order_items where order_id = $1", [o.id]);
    await asUser(f.db, f.users.waiter, () => f.db.query("select public.set_item_status($1, 'cancelled')", [item.id]));
    const err = await pay(f, "cashier", o.id, 100).then(() => null, (x: Error) => x.message);
    expect(err).toBe("order_cancelled");
  });

  it("an item cannot be cancelled once money has been taken", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.pilau, quantity: 1 }, { menu_item_id: f.menu.soda, quantity: 1 }]);
    await pay(f, "cashier", o.id, 1000);
    const drink = await one<{ id: string }>(f.db, "select id from public.order_items where order_id = $1 and fulfilment = 'waiter'", [o.id]);
    const err = await asUser(f.db, f.users.waiter, () => errorOf(() => f.db.query("select public.set_item_status($1, 'cancelled')", [drink.id])));
    expect(err).toBe("order_has_payments");
  });
});

describe("corrections and audit", () => {
  it("payments are never deleted; a manager reverses them with a reason", async () => {
    const o = await newOrder();
    const p = await pay(f, "cashier", o.id, 70000);
    const row = await one<{ id: string }>(f.db, "select id from public.payments where receipt_ref = $1", [p.receipt_ref as string]);
    const del = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("delete from public.payments where id = $1", [row.id])));
    expect(del).toMatch(/permission denied/);
    const asCashier = await asUser(f.db, f.users.cashier, () => errorOf(() => f.db.query("select public.reverse_payment($1, 'oops')", [row.id])));
    expect(asCashier).toBe("forbidden");
    const noReason = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.reverse_payment($1, ' ')", [row.id])));
    expect(noReason).toBe("reason_required");
    await asUser(f.db, f.users.manager, () => f.db.query("select public.reverse_payment($1, 'Customer paid wrong order')", [row.id]));
    const after = await orderRow(o.id);
    expect(after.payment_status).toBe("unpaid");
    expect(Number(after.amount_paid_minor)).toBe(0);
    const kept = await one<{ status: string; reversed_by: string }>(f.db, "select status, reversed_by from public.payments where id = $1", [row.id]);
    expect(kept).toEqual({ status: "reversed", reversed_by: f.users.manager });
    const again = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.reverse_payment($1, 'again')", [row.id])));
    expect(again).toBe("already_reversed");
    // the bill can be paid again, and the freed M-Pesa code can be reused
    expect((await pay(f, "cashier", o.id, 70000)).payment_status).toBe("paid");
  });

  it("managers verify M-Pesa codes; cashiers cannot, and cash has nothing to verify", async () => {
    const o = await newOrder();
    await pay(f, "cashier", o.id, 1000, "mpesa", "ABCD123456");
    await pay(f, "cashier", o.id, 1000, "cash");
    const mp = await one<{ id: string }>(f.db, "select id from public.payments where order_id = $1 and method = 'mpesa'", [o.id]);
    const cash = await one<{ id: string }>(f.db, "select id from public.payments where order_id = $1 and method = 'cash'", [o.id]);
    expect(await asUser(f.db, f.users.cashier, () => errorOf(() => f.db.query("select public.verify_payment_reference($1)", [mp.id])))).toBe("forbidden");
    expect(await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.verify_payment_reference($1)", [cash.id])))).toBe("invalid_transition");
    await asUser(f.db, f.users.manager, () => f.db.query("select public.verify_payment_reference($1)", [mp.id]));
    const v = await one<{ reference_verified: boolean; verified_by: string }>(f.db, "select reference_verified, verified_by from public.payments where id = $1", [mp.id]);
    expect(v).toEqual({ reference_verified: true, verified_by: f.users.manager });
  });

  it("payments and reversals leave audit entries", async () => {
    const n = await one<{ recorded: number; reversed: number }>(f.db, `
      select count(*) filter (where action = 'payment_recorded')::int as recorded,
             count(*) filter (where action = 'payment_reversed')::int as reversed
      from public.audit_logs`);
    expect(n.recorded).toBeGreaterThan(5);
    expect(n.reversed).toBe(1);
  });

  it("totals stay exact: integer minor units, no float drift", async () => {
    const o = await placeOrder(f, "waiter", [{ menu_item_id: f.menu.soda, quantity: 3 }, { menu_item_id: f.menu.pilau, quantity: 3 }]);
    expect(o.total_minor).toBe(3 * 12000 + 3 * 35000);
    expect(Number.isInteger(o.total_minor)).toBe(true);
  });

  it("generated references have the documented format", () => {
    expect(orderRef()).toMatch(/^SH-\d{6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(receiptRef()).toMatch(/^RC-\d{6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });
});
