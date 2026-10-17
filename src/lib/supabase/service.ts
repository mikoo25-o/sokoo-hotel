import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Service-role client. It bypasses RLS, so it is used only for server-owned
 * jobs: the login and join rate limiter, and settling M-Pesa subscription
 * payments. Never use it to read tenant data on behalf of a user.
 */
export function createServiceClient() {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
