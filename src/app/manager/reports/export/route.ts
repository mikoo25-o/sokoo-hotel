import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/session";
import { isDateString } from "@/lib/dates";

const cell = (v: unknown) => {
  let s = String(v ?? "");
  // Stop spreadsheet apps treating text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const money = (m: unknown) => (Number(m ?? 0) / 100).toFixed(2);

/** CSV download of the report. Managers only; the export is written to the audit log. */
export async function GET(req: NextRequest) {
  const ctx = await getContext();
  if (!ctx?.current || !["owner", "manager"].includes(ctx.current.membership.role)) return new NextResponse("Forbidden", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from"), to = sp.get("to");
  if (!isDateString(from) || !isDateString(to)) return new NextResponse("Invalid dates", { status: 400 });

  const supabase = await createClient();
  const rid = ctx.current.restaurant.id;
  const { data, error } = await supabase.rpc("report_summary", { p_restaurant: rid, p_from: from, p_to: to });
  if (error || !data) return new NextResponse("Could not build the report", { status: 400 });
  const s = data as {
    sales_minor: number; collected_minor: number; expenses_minor: number; estimated_profit_minor: number; receivable_minor: number; orders_count: number;
    daily: { date: string; sales_minor: number; collected_minor: number }[]; top_items: { name: string; quantity: number; revenue_minor: number }[];
  };
  await supabase.rpc("log_export", { p_restaurant: rid, p_kind: "report_csv" });

  const lines: string[][] = [
    [`${ctx.current.restaurant.name} report`, from, to],
    [],
    ["Summary (KES)", "Amount"],
    ["Sales (orders placed)", money(s.sales_minor)],
    ["Orders", String(s.orders_count)],
    ["Collected (payments received)", money(s.collected_minor)],
    ["Expenses", money(s.expenses_minor)],
    ["Estimated profit (sales minus expenses)", money(s.estimated_profit_minor)],
    ["Still owed now", money(s.receivable_minor)],
    [],
    ["Date", "Sales", "Collected"],
    ...s.daily.map((d) => [d.date, money(d.sales_minor), money(d.collected_minor)]),
    [],
    ["Item", "Quantity", "Revenue"],
    ...s.top_items.map((t) => [t.name, String(t.quantity), money(t.revenue_minor)]),
  ];
  const body = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n");
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sokohotel-report-${from}-to-${to}.csv"`, "Cache-Control": "no-store" },
  });
}
