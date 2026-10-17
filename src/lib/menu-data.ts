import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { MenuCategory, MenuItem } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface MenuItemView extends MenuItem {
  image_url: string | null;
}

/**
 * Loads categories and items for a restaurant. Photos live in a private
 * bucket, so each item gets a short-lived signed URL.
 */
export async function loadMenu(supabase: Supabase, opts: { includeInactive?: boolean } = {}) {
  let cq = supabase.from("menu_categories").select("id, name, sort_order, is_active").order("sort_order").order("name");
  let iq = supabase
    .from("menu_items")
    .select("id, category_id, name, description, price_minor, image_path, is_available, is_active, fulfilment, sort_order")
    .order("sort_order")
    .order("name");
  if (!opts.includeInactive) {
    cq = cq.eq("is_active", true);
    iq = iq.eq("is_active", true);
  }
  const [{ data: cats }, { data: rows }] = await Promise.all([cq, iq]);
  const categories = (cats ?? []) as MenuCategory[];
  const items = (rows ?? []) as MenuItem[];

  const paths = items.map((i) => i.image_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("menu-images").createSignedUrls(paths, 3600);
    for (const row of data ?? []) if (row.signedUrl && row.path) urls.set(row.path, row.signedUrl);
  }
  const view: MenuItemView[] = items.map((i) => ({ ...i, image_url: i.image_path ? (urls.get(i.image_path) ?? null) : null }));
  return { categories, items: view };
}
