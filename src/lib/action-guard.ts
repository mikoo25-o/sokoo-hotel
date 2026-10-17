import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContext, type AppContext, type Workspace } from "@/lib/session";
import { errorMessage, fail, type ActionState } from "@/lib/errors";
import type { AppRole } from "@/lib/constants";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Guarded =
  | { ok: true; ctx: AppContext & { current: Workspace }; supabase: Supabase; restaurantId: string; role: AppRole }
  | { ok: false; error: ActionState };

/**
 * First line of every server action. Confirms who is calling and which
 * restaurant and role they are acting in, from the verified session and the
 * database, never from anything the browser sent. The database functions and
 * RLS policies check again; this gives a clean error before reaching them.
 */
export async function guard(roles: AppRole[]): Promise<Guarded> {
  const ctx = await getContext();
  if (!ctx) return { ok: false, error: fail(errorMessage("not_authenticated")) };
  if (!ctx.current) return { ok: false, error: fail(errorMessage("forbidden")) };
  const role = ctx.current.membership.role;
  if (!roles.includes(role)) return { ok: false, error: fail(errorMessage("forbidden")) };
  const supabase = await createClient();
  return { ok: true, ctx: ctx as AppContext & { current: Workspace }, supabase, restaurantId: ctx.current.restaurant.id, role };
}
