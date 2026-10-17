import Link from "next/link";
import { PageHeader, Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { requireRole, WAITER_ACCESS } from "@/lib/session";
import { Search } from "lucide-react";
import { SubmitButton } from "@/components/ui/Form";

export const metadata = { title: "Find order" };

export default async function FindOrderPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  await requireRole(WAITER_ACCESS);
  const { ref } = await searchParams;
  const clean = (ref ?? "").trim().toUpperCase().replace(/\s+/g, "");
  let result: { id: string } | null = null;
  if (clean.length >= 6) {
    const supabase = await createClient();
    // RLS limits waiters to their own orders, so a guessed number reveals nothing about anyone else's.
    const { data } = await supabase.from("orders").select("id").eq("reference", clean).maybeSingle();
    result = (data as { id: string } | null) ?? null;
  }
  return (
    <>
      <PageHeader title="Find an order" subtitle="Enter the order number, for example SH-261015-X7K9QM4D." />
      <form className="flex gap-3" action="/waiter/find" method="get">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="ref"
            defaultValue={ref}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="SH-261015-XXXXXXXX"
            aria-label="Order number"
            className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 font-mono uppercase focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <SubmitButton size="lg">Find</SubmitButton>
      </form>
      {clean.length >= 6 ? (
        <Card className="mt-5 p-5">
          {result ? (
            <p className="text-[15px]">
              Order found.{" "}
              <Link href={`/waiter/orders/${result.id}`} className="font-semibold text-primary underline underline-offset-4">
                Open order
              </Link>
            </p>
          ) : (
            <p className="text-[15px] text-muted">No order of yours matches that number. Check it and try again. You can only look up orders you took.</p>
          )}
        </Card>
      ) : null}
    </>
  );
}
