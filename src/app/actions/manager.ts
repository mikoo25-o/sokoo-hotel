"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard } from "@/lib/action-guard";
import { done, errorMessage, fail, type ActionState } from "@/lib/errors";
import { generateJoinCode } from "@/lib/refs";
import { parseMoneyToMinor } from "@/lib/money";
import { isDateString } from "@/lib/dates";
import { fieldErrors, formObject, phoneSchema, uuidSchema } from "@/lib/validation";
import { MANAGERS } from "@/lib/session";

const bump = () => revalidatePath("/", "layout");

// ---------------------------------------------------------------------------
// Staff and joining code
// ---------------------------------------------------------------------------
export async function rotateJoinCodeAction(): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  for (let i = 0; i < 4; i++) {
    const { error } = await g.supabase.rpc("rotate_join_code", { p_restaurant: g.restaurantId, p_code: generateJoinCode() });
    if (!error) {
      bump();
      return done("New joining code created. The old one no longer works.");
    }
    if (error.code !== "23505") return fail(errorMessage(error));
  }
  return fail("Could not create a code. Please try again.");
}

export async function revokeJoinCodeAction(): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const { error } = await g.supabase.rpc("revoke_join_code", { p_restaurant: g.restaurantId });
  if (error) return fail(errorMessage(error));
  bump();
  return done("Joining is switched off. Create a new code when you are ready to add staff.");
}

export async function decideJoinAction(requestId: string, approve: boolean, role?: string): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const id = uuidSchema.safeParse(requestId);
  const r = z.enum(["waiter", "kitchen", "cashier", "manager"]).optional().safeParse(role);
  if (!id.success || !r.success) return fail(errorMessage("invalid_role"));
  const { error } = await g.supabase.rpc("decide_join_request", { p_request: id.data, p_approve: approve, p_role: approve ? (r.data ?? null) : null });
  if (error) return fail(errorMessage(error));
  bump();
  return done(approve ? "Approved. They can now sign in." : "Request declined.");
}

export async function setMemberRoleAction(membershipId: string, role: string): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const id = uuidSchema.safeParse(membershipId);
  const r = z.enum(["waiter", "kitchen", "cashier", "manager"]).safeParse(role);
  if (!id.success || !r.success) return fail(errorMessage("invalid_role"));
  const { error } = await g.supabase.rpc("set_member_role", { p_membership: id.data, p_role: r.data });
  if (error) return fail(errorMessage(error));
  bump();
  return done("Role updated.");
}

export async function setMemberActiveAction(membershipId: string, active: boolean): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const id = uuidSchema.safeParse(membershipId);
  if (!id.success) return fail(errorMessage("not_found"));
  const { error } = await g.supabase.rpc("set_member_active", { p_membership: id.data, p_active: active });
  if (error) return fail(errorMessage(error));
  bump();
  return done(active ? "Access restored." : "Access removed. Their records are kept.");
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export async function saveCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const p = z.object({ id: uuidSchema.optional().or(z.literal("")), name: z.string().trim().min(1, "Enter a name").max(60) }).safeParse(formObject(fd));
  if (!p.success) return fail("Check the form.", fieldErrors(p.error));
  const { id, name } = p.data;
  const q = id
    ? g.supabase.from("menu_categories").update({ name }).eq("id", id)
    : g.supabase.from("menu_categories").insert({ restaurant_id: g.restaurantId, name });
  const { error } = await q;
  if (error) return fail(error.code === "23505" ? "A category with that name already exists." : errorMessage(error));
  bump();
  return done(id ? "Category renamed." : "Category added.");
}

export async function setCategoryActiveAction(id: string, active: boolean): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  if (!uuidSchema.safeParse(id).success) return fail(errorMessage("not_found"));
  const { error } = await g.supabase.from("menu_categories").update({ is_active: active }).eq("id", id);
  if (error) return fail(errorMessage(error));
  bump();
  return done();
}

const itemSchema = z.object({
  id: uuidSchema.optional().or(z.literal("")),
  category_id: uuidSchema,
  name: z.string().trim().min(1, "Enter a name").max(80),
  description: z.string().trim().max(300).optional(),
  price: z.string().min(1, "Enter a price"),
  fulfilment: z.enum(["kitchen", "waiter"]),
  image_path: z.string().max(300).optional(),
  is_available: z.string().optional(),
});

export async function saveMenuItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const p = itemSchema.safeParse(formObject(fd));
  if (!p.success) return fail("Check the form.", fieldErrors(p.error));
  const v = p.data;
  const price = parseMoneyToMinor(v.price);
  if (!price || price <= 0 || price > 100_000_000) return fail("Check the form.", { price: "Enter a price greater than zero, for example 350" });
  if (v.image_path && !v.image_path.startsWith(`${g.restaurantId}/menu/`)) return fail("That photo could not be used. Upload it again.");

  const row = {
    category_id: v.category_id,
    name: v.name,
    description: v.description || null,
    price_minor: price,
    fulfilment: v.fulfilment,
    is_available: v.is_available === "on",
    ...(v.image_path !== undefined ? { image_path: v.image_path || null } : {}),
  };
  const { error } = v.id
    ? await g.supabase.from("menu_items").update(row).eq("id", v.id)
    : await g.supabase.from("menu_items").insert({ ...row, restaurant_id: g.restaurantId });
  if (error) return fail(error.code === "23505" ? "That category already has an item with this name." : errorMessage(error));
  bump();
  return done(v.id ? "Item saved." : "Item added.");
}

export async function setItemFlagAction(id: string, flag: "is_available" | "is_active", value: boolean): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  if (!uuidSchema.safeParse(id).success || !["is_available", "is_active"].includes(flag)) return fail(errorMessage("not_found"));
  const { error } = await g.supabase.from("menu_items").update({ [flag]: value }).eq("id", id);
  if (error) return fail(errorMessage(error));
  bump();
  return done();
}

// ---------------------------------------------------------------------------
// Tables / service locations
// ---------------------------------------------------------------------------
export async function addLocationsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const p = z
    .object({
      area: z.string().trim().min(1, "Enter an area").max(40),
      prefix: z.string().trim().max(20).default("Table"),
      from: z.coerce.number().int().min(1).max(999),
      to: z.coerce.number().int().min(1).max(999),
      seats: z.string().optional(),
    })
    .safeParse(formObject(fd));
  if (!p.success) return fail("Check the form.", fieldErrors(p.error));
  const { area, prefix, from, to } = p.data;
  if (to < from || to - from > 59) return fail("Add up to 60 tables at a time, with the last number after the first.");
  const seats = p.data.seats ? Number(p.data.seats) : null;
  if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > 50)) return fail("Seats must be between 1 and 50.");
  const rows = Array.from({ length: to - from + 1 }, (_, i) => ({
    restaurant_id: g.restaurantId,
    name: `${prefix ? prefix + " " : ""}${from + i}`.slice(0, 40),
    area,
    kind: "table" as const,
    seats,
    sort_order: from + i,
  }));
  const { error } = await g.supabase.from("service_locations").insert(rows);
  if (error) return fail(error.code === "23505" ? "One of those tables already exists in that area." : errorMessage(error));
  bump();
  return done(`${rows.length} table${rows.length === 1 ? "" : "s"} added.`);
}

export async function setLocationActiveAction(id: string, active: boolean): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  if (!uuidSchema.safeParse(id).success) return fail(errorMessage("not_found"));
  const { error } = await g.supabase.from("service_locations").update({ is_active: active }).eq("id", id);
  if (error) return fail(errorMessage(error));
  bump();
  return done();
}

export async function setTakeawayAction(enabled: boolean): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const { error } = await g.supabase.from("restaurants").update({ takeaway_enabled: enabled }).eq("id", g.restaurantId);
  if (error) return fail(errorMessage(error));
  if (enabled) {
    const { data } = await g.supabase.from("service_locations").select("id").eq("kind", "takeaway").limit(1);
    if (!data?.length) {
      await g.supabase.from("service_locations").insert({ restaurant_id: g.restaurantId, name: "Takeaway", area: "Takeaway", kind: "takeaway", sort_order: 0 });
    } else {
      await g.supabase.from("service_locations").update({ is_active: true }).eq("kind", "takeaway");
    }
  } else {
    await g.supabase.from("service_locations").update({ is_active: false }).eq("kind", "takeaway");
  }
  bump();
  return done(enabled ? "Takeaway orders are on." : "Takeaway orders are off.");
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
const expenseSchema = z.object({
  amount: z.string().min(1, "Enter the amount"),
  category: z.enum(["stock", "supplies", "wages", "rent", "utilities", "transport", "repairs", "other"]),
  expense_date: z.string().refine(isDateString, "Choose a date"),
  description: z.string().trim().min(1, "Describe the expense").max(200),
  payment_method: z.enum(["cash", "mpesa", "bank", "other"]),
  payment_reference: z.string().trim().max(60).optional(),
  receipt_path: z.string().max(300).optional(),
});

export async function addExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const p = expenseSchema.safeParse(formObject(fd));
  if (!p.success) return fail("Check the form.", fieldErrors(p.error));
  const v = p.data;
  const amount = parseMoneyToMinor(v.amount);
  if (!amount || amount <= 0 || amount > 1_000_000_000) return fail("Check the form.", { amount: "Enter an amount greater than zero" });
  if (v.receipt_path && !v.receipt_path.startsWith(`${g.restaurantId}/receipts/`)) return fail("That receipt photo could not be used. Upload it again.");
  const { error } = await g.supabase.from("expenses").insert({
    restaurant_id: g.restaurantId,
    amount_minor: amount,
    category: v.category,
    expense_date: v.expense_date,
    description: v.description,
    payment_method: v.payment_method,
    payment_reference: v.payment_reference || null,
    receipt_path: v.receipt_path || null,
    created_by: g.ctx.user.id,
    created_by_name: g.ctx.profile.full_name,
  });
  if (error) return fail(errorMessage(error));
  bump();
  return done("Expense saved.");
}

export async function voidExpenseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const p = z.object({ id: uuidSchema, reason: z.string().trim().min(3, "Give a short reason").max(300) }).safeParse(formObject(fd));
  if (!p.success) return fail("Check the form.", fieldErrors(p.error));
  const { error } = await g.supabase
    .from("expenses")
    .update({ voided_at: new Date().toISOString(), voided_by: g.ctx.user.id, void_reason: p.data.reason })
    .eq("id", p.data.id)
    .is("voided_at", null);
  if (error) return fail(errorMessage(error));
  bump();
  return done("Expense voided. It stays in the record with your reason.");
}

// ---------------------------------------------------------------------------
// Restaurant settings
// ---------------------------------------------------------------------------
const TIMEZONES = ["Africa/Nairobi", "Africa/Kampala", "Africa/Dar_es_Salaam", "Africa/Kigali", "Africa/Addis_Ababa", "UTC"];

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const p = z
    .object({
      name: z.string().trim().min(2, "Enter the restaurant name").max(80),
      phone: phoneSchema,
      email: z.string().trim().email("Enter a valid email").max(160).or(z.literal("")),
      address: z.string().trim().max(200),
      timezone: z.enum(TIMEZONES as [string, ...string[]]),
      receipt_header: z.string().trim().max(120),
      receipt_footer: z.string().trim().max(160),
    })
    .safeParse(formObject(fd));
  if (!p.success) return fail("Check the form.", fieldErrors(p.error));
  const v = p.data;
  const { data: cur } = await g.supabase.from("restaurants").select("settings").eq("id", g.restaurantId).single();
  const settings = {
    ...((cur?.settings as Record<string, unknown> | null) ?? {}),
    notify_new_orders: fd.get("notify_new_orders") === "on",
    notify_payments: fd.get("notify_payments") === "on",
  };
  const { error } = await g.supabase
    .from("restaurants")
    .update({
      name: v.name,
      phone: v.phone || null,
      email: v.email || null,
      address: v.address || null,
      timezone: v.timezone,
      receipt_header: v.receipt_header || null,
      receipt_footer: v.receipt_footer || null,
      settings,
    })
    .eq("id", g.restaurantId);
  if (error) return fail(errorMessage(error));
  bump();
  return done("Settings saved.");
}

// ---------------------------------------------------------------------------
// Optional starter data (a convenience for an empty restaurant, never automatic)
// ---------------------------------------------------------------------------
const STARTER: { category: string; items: { name: string; price: number; fulfilment: "kitchen" | "waiter" }[] }[] = [
  { category: "Mains", items: [
    { name: "Ugali Nyama Choma", price: 650, fulfilment: "kitchen" },
    { name: "Ugali Sukuma", price: 200, fulfilment: "kitchen" },
    { name: "Pilau", price: 350, fulfilment: "kitchen" },
    { name: "Chapati Beans", price: 250, fulfilment: "kitchen" },
  ] },
  { category: "Breakfast", items: [
    { name: "Mandazi (2)", price: 50, fulfilment: "kitchen" },
    { name: "Chai", price: 60, fulfilment: "kitchen" },
  ] },
  { category: "Drinks", items: [
    { name: "Soda 300ml", price: 80, fulfilment: "waiter" },
    { name: "Bottled Water 500ml", price: 60, fulfilment: "waiter" },
  ] },
];

/** Adds an editable starter menu and 8 tables, only to a restaurant that has neither. No orders or sales are created. */
export async function addStarterDataAction(): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  const [items, locs] = await Promise.all([
    g.supabase.from("menu_items").select("id", { count: "exact", head: true }),
    g.supabase.from("service_locations").select("id", { count: "exact", head: true }),
  ]);
  if ((items.count ?? 0) > 0) return fail("Your menu already has items, so nothing was added.");

  const { data: cats, error: ce } = await g.supabase
    .from("menu_categories")
    .insert(STARTER.map((c, i) => ({ restaurant_id: g.restaurantId, name: c.category, sort_order: i })))
    .select("id, name");
  if (ce || !cats) return fail(ce ? errorMessage(ce) : "Could not add the starter menu.");
  const idOf = new Map(cats.map((c) => [c.name, c.id as string]));
  const rows = STARTER.flatMap((c) =>
    c.items.map((it, i) => ({
      restaurant_id: g.restaurantId,
      category_id: idOf.get(c.category)!,
      name: it.name,
      price_minor: it.price * 100,
      fulfilment: it.fulfilment,
      sort_order: i,
    })),
  );
  const { error: ie } = await g.supabase.from("menu_items").insert(rows);
  if (ie) return fail(errorMessage(ie));

  if ((locs.count ?? 0) === 0) {
    const tables = Array.from({ length: 8 }, (_, i) => ({ restaurant_id: g.restaurantId, name: `Table ${i + 1}`, area: "Main Hall", kind: "table" as const, sort_order: i + 1 }));
    const { error: le } = await g.supabase.from("service_locations").insert(tables);
    if (le) return fail(errorMessage(le));
  }
  bump();
  return done("Starter menu added. Edit the names and prices to match your restaurant.");
}
