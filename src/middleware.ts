import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/waiter", "/kitchen", "/cashier", "/manager", "/onboarding", "/pending", "/workspace", "/account"];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  const configured = Boolean(url && key && /^https?:\/\//.test(url) && !url.includes("YOUR-PROJECT-REF") && !key.startsWith("YOUR-"));
  if (!configured) {
    if (isProtected) {
      const to = request.nextUrl.clone();
      to.pathname = "/login";
      to.search = "";
      return NextResponse.redirect(to);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url!, key!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() checks the token locally and refreshes it when it is close to
  // expiring, so navigation does not wait on a call to the Auth server.
  const { data: auth } = await supabase.auth.getClaims();
  const user = auth?.claims?.sub ? auth.claims : null;

  if (isProtected && !user) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|brand/|landing/|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)"],
};
