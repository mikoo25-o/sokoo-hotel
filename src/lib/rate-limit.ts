import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

const memory = new Map<string, { start: number; hits: number }>();

/**
 * Returns true while the caller is within the limit. Uses the shared Postgres
 * counter (works across serverless instances) when the service-role key is
 * configured. Without it, it falls back to a per-instance memory counter,
 * which is weaker on serverless hosts. The README documents this.
 */
export async function withinRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const service = createServiceClient();
  if (service) {
    const { data, error } = await service.rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (!error && typeof data === "boolean") return data;
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now - entry.start > windowSeconds * 1000) {
    memory.set(key, { start: now, hits: 1 });
    if (memory.size > 5000) memory.clear();
    return true;
  }
  entry.hits += 1;
  return entry.hits <= max;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
