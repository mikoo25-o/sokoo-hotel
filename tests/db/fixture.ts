import type { PGlite } from "@electric-sql/pglite";
import { randomInt } from "node:crypto";
import { addUser, asUser, createDb } from "./harness";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Valid-format references with a random tail, like the app generates. */
export function orderRef(): string {
  const tail = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `SH-261015-${tail}`;
}
export function receiptRef(): string {
  return orderRef().replace(/^SH-/, "RC-");
}
let keySeq = 0;
export function key(): string {
  keySeq += 1;
  return `idem-${keySeq}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface Fixture {
  db: PGlite;
  rid: string;
  ridB: string;
  users: Record<"owner" | "manager" | "waiter" | "waiter2" | "kitchen" | "cashier" | "outsider" | "stranger", string>;
  menu: { pilau: string; stew: string; soda: string; fish: string };
  tables: { t1: string; t2: string };
}

export async function one<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0];
}

export async function buildFixture(): Promise<Fixture> {
  const db = await createDb();
  const names = ["owner", "manager", "waiter", "waiter2", "kitchen", "cashier", "outsider", "stranger"] as const;
  const users = {} as Fixture["users"];
  for (const n of names) users[n] = await addUser(db, `${n[0].toUpperCase()}${n.slice(1)} Person`);

  const rid = await asUser(db, users.owner, async () =>
    (await one<{ id: string }>(db, "select public.create_restaurant($1,$2,$3,$4,$5,$6) as id",
      ["Sunrise Restaurant", "0700000000", "Kisii Town", "SOKO2ABCDE", true, 14])).id);
  const ridB = await asUser(db, users.outsider, async () =>
    (await one<{ id: string }>(db, "select public.create_restaurant($1,$2,$3,$4,$5,$6) as id",
      ["Other Place", null, null, "SOKO3FGHJK", true, 14])).id);

  // Staff join with the code and the owner approves them.
  const staff: [keyof Fixture["users"], string][] = [
    ["manager", "manager"], ["waiter", "waiter"], ["waiter2", "waiter"], ["kitchen", "kitchen"], ["cashier", "cashier"],
  ];
  for (const [who] of staff) {
    await asUser(db, users[who], () => db.query("select public.request_join($1)", ["SOKO2ABCDE"]));
  }
  for (const [who, role] of staff) {
    const reqId = (await one<{ id: string }>(db, "select id from public.join_requests where user_id = $1 and status = 'pending'", [users[who]])).id;
    await asUser(db, users.owner, () => db.query("select public.decide_join_request($1, true, $2::public.app_role)", [reqId, role]));
  }

  // Menu and tables, created the way the manager UI does it.
  const menu = await asUser(db, users.owner, async () => {
    const main = (await one<{ id: string }>(db, "insert into public.menu_categories (restaurant_id, name) values ($1, 'Main Dishes') returning id", [rid])).id;
    const drinks = (await one<{ id: string }>(db, "insert into public.menu_categories (restaurant_id, name) values ($1, 'Drinks') returning id", [rid])).id;
    const ins = async (cat: string, name: string, price: number, f: string, avail = true) =>
      (await one<{ id: string }>(db,
        "insert into public.menu_items (restaurant_id, category_id, name, price_minor, fulfilment, is_available) values ($1,$2,$3,$4,$5::public.fulfilment_type,$6) returning id",
        [rid, cat, name, price, f, avail])).id;
    return {
      pilau: await ins(main, "Chicken Pilau", 35000, "kitchen"),
      stew: await ins(main, "Beef Stew", 30000, "kitchen"),
      soda: await ins(drinks, "Soda", 12000, "waiter"),
      fish: await ins(main, "Fish Fillet", 40000, "kitchen", false),
    };
  });
  const tables = await asUser(db, users.owner, async () => {
    const ins = async (name: string) =>
      (await one<{ id: string }>(db, "insert into public.service_locations (restaurant_id, name) values ($1,$2) returning id", [rid, name])).id;
    return { t1: await ins("Table 1"), t2: await ins("Table 2") };
  });

  return { db, rid, ridB, users, menu, tables };
}

/** Places an order as the given user and returns the RPC result. */
export async function placeOrder(
  f: Fixture,
  who: keyof Fixture["users"],
  items: { menu_item_id: string; quantity: number; note?: string }[],
  opts: { table?: string; idem?: string } = {},
) {
  return asUser(f.db, f.users[who], async () =>
    (await one<{ r: { id: string; reference: string; total_minor: number; duplicate: boolean } }>(
      f.db,
      "select public.create_order($1,$2,$3,$4::jsonb,$5) as r",
      [f.rid, orderRef(), opts.table ?? f.tables.t1, JSON.stringify(items), opts.idem ?? key()],
    )).r);
}

export async function pay(
  f: Fixture,
  who: keyof Fixture["users"],
  orderId: string,
  amount: number,
  method: "cash" | "mpesa" = "cash",
  txn: string | null = null,
  idem = key(),
) {
  return asUser(f.db, f.users[who], async () =>
    (await one<{ r: Record<string, unknown> }>(
      f.db,
      "select public.record_payment($1,$2,$3::public.payment_method,$4,$5,$6) as r",
      [orderId, amount, method, txn, receiptRef(), idem],
    )).r);
}
