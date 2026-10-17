import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { JOIN_CODE_RE } from "@/lib/validation";

/** Target of the QR code / share link on the Staff page: /join?code=SOKOXXXXXX */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").toUpperCase();
  if (!JOIN_CODE_RE.test(code)) return NextResponse.redirect(`${origin}/signup?path=join`);
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return NextResponse.redirect(`${origin}/onboarding/join?code=${code}`);
  }
  return NextResponse.redirect(`${origin}/signup?path=join&code=${code}`);
}
