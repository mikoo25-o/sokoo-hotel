import { beforeAll, describe, expect, it } from "vitest";
import { addUser, asUser, errorOf } from "./harness";
import { buildFixture, one, type Fixture } from "./fixture";

let f: Fixture;
beforeAll(async () => {
  f = await buildFixture();
});

const requestJoin = (who: string, code: string, role: string | null = null) =>
  asUser(f.db, who, async () =>
    (await one<{ s: string }>(f.db, "select public.request_join($1, null, $2::public.app_role) as s", [code, role])).s);

describe("restaurant creation", () => {
  it("makes the creator the owner, starts a trial, and adds takeaway", async () => {
    const m = await one<{ role: string; status: string }>(f.db,
      "select role, status from public.memberships where restaurant_id = $1 and user_id = $2", [f.rid, f.users.owner]);
    expect(m).toEqual({ role: "owner", status: "active" });
    const s = await one<{ status: string; trial: boolean }>(f.db,
      "select status, trial_ends_at > now() as trial from public.subscriptions where restaurant_id = $1", [f.rid]);
    expect(s).toEqual({ status: "trial", trial: true });
    const loc = await one<{ kind: string }>(f.db, "select kind from public.service_locations where restaurant_id = $1 and kind = 'takeaway'", [f.rid]);
    expect(loc.kind).toBe("takeaway");
  });

  it("starts with an empty menu, no orders and no payments", async () => {
    const r = await one<{ items: number; orders: number; payments: number }>(f.db, `
      select (select count(*) from public.menu_items where restaurant_id = $1)::int as items,
             (select count(*) from public.orders where restaurant_id = $2)::int as orders,
             (select count(*) from public.payments where restaurant_id = $2)::int as payments`, [f.ridB, f.ridB]);
    expect(r).toEqual({ items: 0, orders: 0, payments: 0 });
  });

  it("rejects a malformed join code and a duplicate code", async () => {
    const u = await addUser(f.db, "Dup Owner");
    const bad = await asUser(f.db, u, () => errorOf(() => f.db.query("select public.create_restaurant('Bad','','', 'SOKO', true, 14)")));
    expect(bad).toMatch(/check constraint/);
    const dup = await asUser(f.db, u, () => errorOf(() => f.db.query("select public.create_restaurant('Dup','','', 'SOKO2ABCDE', true, 14)")));
    expect(dup).toMatch(/unique/);
  });
});

describe("joining a restaurant", () => {
  it("an unknown code is refused without revealing anything", async () => {
    const u = await addUser(f.db, "Curious Cat");
    expect(await requestJoin(u, "SOKO9ZZZZZ")).toBe("invalid_code");
  });

  it("a valid code creates a pending request and grants no access", async () => {
    const u = await addUser(f.db, "New Waiter");
    expect(await requestJoin(u, "soko2abcde", "waiter")).toBe("pending"); // case-insensitive
    expect(await requestJoin(u, "SOKO2ABCDE")).toBe("already_pending");
    const items = await asUser(f.db, u, async () => (await f.db.query("select 1 from public.menu_items")).rows.length);
    const rest = await asUser(f.db, u, async () => (await f.db.query("select 1 from public.restaurants")).rows.length);
    expect(items + rest).toBe(0);
  });

  it("users cannot approve themselves or pick their own role", async () => {
    const u = await addUser(f.db, "Sneaky Sam");
    await requestJoin(u, "SOKO2ABCDE");
    const req = await one<{ id: string }>(f.db, "select id from public.join_requests where user_id = $1", [u]);
    const err = await asUser(f.db, u, () => errorOf(() => f.db.query("select public.decide_join_request($1, true, 'manager')", [req.id])));
    expect(err).toBe("forbidden");
    const err2 = await asUser(f.db, u, () => errorOf(() => f.db.query("insert into public.memberships (restaurant_id, user_id, role) values ($1,$2,'owner')", [f.rid, u])));
    expect(err2).toMatch(/permission denied/);
    const err3 = await asUser(f.db, u, () => errorOf(() => f.db.query("update public.join_requests set status = 'approved' where id = $1", [req.id])));
    expect(err3).toMatch(/permission denied/);
  });

  it("a waiter cannot approve requests", async () => {
    const u = await addUser(f.db, "Pending Pat");
    await requestJoin(u, "SOKO2ABCDE");
    const req = await one<{ id: string }>(f.db, "select id from public.join_requests where user_id = $1", [u]);
    const err = await asUser(f.db, f.users.waiter, () => errorOf(() => f.db.query("select public.decide_join_request($1, true, 'waiter')", [req.id])));
    expect(err).toBe("forbidden");
  });

  it("a manager approves with a role and the user becomes a member", async () => {
    const u = await addUser(f.db, "Approved Ann");
    await requestJoin(u, "SOKO2ABCDE", "cashier");
    const req = await one<{ id: string }>(f.db, "select id from public.join_requests where user_id = $1", [u]);
    await asUser(f.db, f.users.manager, () => f.db.query("select public.decide_join_request($1, true, 'kitchen')", [req.id]));
    const role = await one<{ role: string }>(f.db, "select role from public.memberships where user_id = $1 and restaurant_id = $2", [u, f.rid]);
    expect(role.role).toBe("kitchen"); // the manager's decision wins over the requested role
    expect(await requestJoin(u, "SOKO2ABCDE")).toBe("already_member");
    const audit = await one<{ n: number }>(f.db, "select count(*)::int as n from public.audit_logs where action = 'join_approved' and entity_id = $1", [u]);
    expect(audit.n).toBe(1);
  });

  it("only the owner can grant manager access, and nobody can grant owner", async () => {
    const u = await addUser(f.db, "Mgr Candidate");
    await requestJoin(u, "SOKO2ABCDE");
    const req = await one<{ id: string }>(f.db, "select id from public.join_requests where user_id = $1", [u]);
    const e1 = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.decide_join_request($1, true, 'manager')", [req.id])));
    expect(e1).toBe("forbidden");
    const e2 = await asUser(f.db, f.users.owner, () => errorOf(() => f.db.query("select public.decide_join_request($1, true, 'owner')", [req.id])));
    expect(e2).toBe("invalid_role");
    await asUser(f.db, f.users.owner, () => f.db.query("select public.decide_join_request($1, true, 'manager')", [req.id]));
    const m = await one<{ role: string }>(f.db, "select role from public.memberships where user_id = $1", [u]);
    expect(m.role).toBe("manager");
  });

  it("a rejected request leaves the user without access and can be retried", async () => {
    const u = await addUser(f.db, "Rejected Rob");
    await requestJoin(u, "SOKO2ABCDE");
    const req = await one<{ id: string }>(f.db, "select id from public.join_requests where user_id = $1", [u]);
    await asUser(f.db, f.users.manager, () => f.db.query("select public.decide_join_request($1, false)", [req.id]));
    const members = await one<{ n: number }>(f.db, "select count(*)::int as n from public.memberships where user_id = $1", [u]);
    expect(members.n).toBe(0);
    expect(await requestJoin(u, "SOKO2ABCDE")).toBe("pending");
  });

  it("a request can only be decided once", async () => {
    const u = await addUser(f.db, "Twice Tim");
    await requestJoin(u, "SOKO2ABCDE");
    const req = await one<{ id: string }>(f.db, "select id from public.join_requests where user_id = $1", [u]);
    await asUser(f.db, f.users.manager, () => f.db.query("select public.decide_join_request($1, false)", [req.id]));
    const err = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.decide_join_request($1, true, 'waiter')", [req.id])));
    expect(err).toBe("already_decided");
  });

  it("join attempts are rate limited", async () => {
    const u = await addUser(f.db, "Guesser Gus");
    const results: string[] = [];
    for (let i = 0; i < 12; i++) results.push(await requestJoin(u, `SOKO9${String(i).padStart(5, "K")}`));
    expect(results.slice(0, 10).every((r) => r === "invalid_code")).toBe(true);
    expect(results[10]).toBe("rate_limited");
  });

  it("a revoked code stops working; a rotated code replaces the old one", async () => {
    await asUser(f.db, f.users.manager, () => f.db.query("select public.rotate_join_code($1, 'SOKO4NEWCD')", [f.rid]));
    const u = await addUser(f.db, "Old Code Olga");
    expect(await requestJoin(u, "SOKO2ABCDE")).toBe("invalid_code");
    expect(await requestJoin(u, "SOKO4NEWCD")).toBe("pending");
    await asUser(f.db, f.users.manager, () => f.db.query("select public.revoke_join_code($1)", [f.rid]));
    const u2 = await addUser(f.db, "Revoked Rita");
    expect(await requestJoin(u2, "SOKO4NEWCD")).toBe("invalid_code");
    const a = await one<{ n: number }>(f.db, "select count(*)::int as n from public.audit_logs where action in ('join_code_rotated','join_code_revoked')");
    expect(a.n).toBe(2);
  });
});

describe("staff management", () => {
  it("managers deactivate staff, who then lose access; the owner cannot be touched", async () => {
    const m = await one<{ id: string }>(f.db, "select id from public.memberships where user_id = $1", [f.users.waiter2]);
    await asUser(f.db, f.users.manager, () => f.db.query("select public.set_member_active($1, false)", [m.id]));
    const rows = await asUser(f.db, f.users.waiter2, async () => (await f.db.query("select 1 from public.menu_items")).rows.length);
    expect(rows).toBe(0);
    const owner = await one<{ id: string }>(f.db, "select id from public.memberships where user_id = $1", [f.users.owner]);
    const err = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.set_member_active($1, false)", [owner.id])));
    expect(err).toBe("invalid_role");
    const err2 = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.set_member_role($1, 'waiter')", [owner.id])));
    expect(err2).toBe("invalid_role");
    await asUser(f.db, f.users.manager, () => f.db.query("select public.set_member_active($1, true)", [m.id]));
  });

  it("role changes are limited and audited", async () => {
    const m = await one<{ id: string }>(f.db, "select id from public.memberships where user_id = $1", [f.users.cashier]);
    await asUser(f.db, f.users.manager, () => f.db.query("select public.set_member_role($1, 'waiter')", [m.id]));
    const err = await asUser(f.db, f.users.manager, () => errorOf(() => f.db.query("select public.set_member_role($1, 'manager')", [m.id])));
    expect(err).toBe("forbidden");
    const selfErr = await asUser(f.db, f.users.manager, async () => {
      const me = await one<{ id: string }>(f.db, "select id from public.memberships where user_id = $1", [f.users.manager]);
      return errorOf(() => f.db.query("select public.set_member_role($1, 'cashier')", [me.id]));
    });
    expect(selfErr).toBe("cannot_change_self");
    await asUser(f.db, f.users.manager, () => f.db.query("select public.set_member_role($1, 'cashier')", [m.id]));
    const n = await one<{ n: number }>(f.db, "select count(*)::int as n from public.audit_logs where action = 'role_changed'");
    expect(n.n).toBe(2);
  });
});
