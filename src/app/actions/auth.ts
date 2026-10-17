"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, siteUrl, trialDays } from "@/lib/env";
import { clientIp, withinRateLimit } from "@/lib/rate-limit";
import { done, errorMessage, fail, type ActionState } from "@/lib/errors";
import {
  LOGIN_ROLES, ROLE_HOME, ROLE_LABEL, WORKSPACE_COOKIE, matchesLoginRole, type AppRole, type LoginRole,
} from "@/lib/constants";
import { generateJoinCode } from "@/lib/refs";
import { emailSchema, fieldErrors, formObject, passwordSchema, phoneSchema, safeNext, uuidSchema, JOIN_CODE_RE } from "@/lib/validation";

const NOT_CONFIGURED =
  "SokoHotel is not connected to its database yet. Add your Supabase keys to .env.local and restart (see the README).";

async function setWorkspaceCookie(restaurantId: string) {
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, restaurantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
  role: z.enum(["waiter", "kitchen", "cashier", "manager"]),
});

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = signInSchema.safeParse(formObject(formData));
  if (!parsed.success) return fail("Check the highlighted fields.", fieldErrors(parsed.error));
  const { email, password, role } = parsed.data;

  const ip = await clientIp();
  const allowed = (await withinRateLimit(`login:ip:${ip}`, 25, 900)) && (await withinRateLimit(`login:email:${email}`, 8, 900));
  if (!allowed) return fail(errorMessage("rate_limited"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") {
      return fail("Please verify your email first. Open the confirmation link we sent to your inbox.");
    }
    // The same message for a wrong password and an unknown email.
    return fail("Incorrect email or password.");
  }

  // The role card is only a request. What counts is the approved membership.
  const { data: rows } = await supabase
    .from("memberships")
    .select("restaurant_id, role")
    .eq("user_id", data.user.id)
    .eq("status", "active");
  const memberships = (rows ?? []) as { restaurant_id: string; role: AppRole }[];

  if (memberships.length === 0) {
    const { data: pending } = await supabase.rpc("my_join_requests");
    const hasPending = ((pending ?? []) as { status: string }[]).some((r) => r.status === "pending");
    redirect(hasPending ? "/pending" : "/onboarding");
  }

  const matching = memberships.filter((m) => matchesLoginRole(m.role, role as LoginRole));
  if (matching.length === 0) {
    await supabase.auth.signOut();
    const actual = [...new Set(memberships.map((m) => ROLE_LABEL[m.role]))].join(" or ");
    const asked = LOGIN_ROLES.find((r) => r.value === role)?.label ?? role;
    return fail(`This account is not approved as ${asked}. Your role is ${actual}. Choose ${actual} and sign in again.`);
  }

  if (matching.length > 1) redirect(`/workspace?role=${role}`);

  const only = matching[0];
  await setWorkspaceCookie(only.restaurant_id);
  const home = ROLE_HOME[only.role];
  const next = safeNext(formData.get("next"));
  redirect(next && (next === home || next.startsWith(home + "/")) ? next : home);
}

// ---------------------------------------------------------------------------
// Sign up, email verification, password reset
// ---------------------------------------------------------------------------
const signUpSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  path: z.enum(["create", "join"]),
  code: z.string().trim().toUpperCase().max(20).optional(),
});

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = signUpSchema.safeParse(formObject(formData));
  if (!parsed.success) return fail("Check the highlighted fields.", fieldErrors(parsed.error));
  const { full_name, email, phone, password, path, code } = parsed.data;

  const ip = await clientIp();
  if (!(await withinRateLimit(`signup:ip:${ip}`, 10, 3600))) return fail(errorMessage("rate_limited"));

  const supabase = await createClient();
  const nextPath = `/onboarding/${path}${path === "join" && code && JOIN_CODE_RE.test(code) ? `?code=${code}` : ""}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name, phone },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return fail("That password is too easy to guess. Try a longer one.");
    if (error.status === 429) return fail(errorMessage("rate_limited"));
    return fail("We could not create the account. Please check your details and try again.");
  }

  // Email confirmation on: no session yet. The same screen is shown whether or
  // not the address already had an account, so signup cannot be used to probe
  // which emails are registered.
  if (!data.session) redirect(`/signup/check-email?email=${encodeURIComponent(email)}`);
  redirect(nextPath);
}

export async function requestPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return fail("Enter a valid email address.", { email: "Enter a valid email address" });
  const ip = await clientIp();
  if (!(await withinRateLimit(`reset:ip:${ip}`, 8, 3600)) || !(await withinRateLimit(`reset:email:${parsed.data}`, 3, 3600))) {
    return fail(errorMessage("rate_limited"));
  }
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  // Always the same answer, so the form does not reveal which emails exist.
  return done("If that email has a SokoHotel account, a reset link is on its way. It expires soon, so use it promptly.");
}

export async function updatePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return fail("Check the highlighted fields.", { password: password.error.issues[0].message });
  if (formData.get("confirm") !== formData.get("password")) {
    return fail("Check the highlighted fields.", { confirm: "The passwords do not match" });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("This reset link has expired. Request a new one.");
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) {
    if (error.code === "same_password") return fail("Choose a password you have not used before.", { password: "Choose a new password" });
    return fail("We could not update the password. Request a new reset link and try again.");
  }
  await supabase.auth.signOut();
  redirect("/login?reset=1");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  const store = await cookies();
  store.delete(WORKSPACE_COOKIE);
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Workspaces, onboarding
// ---------------------------------------------------------------------------
export async function selectWorkspace(formData: FormData) {
  const id = uuidSchema.safeParse(formData.get("restaurant_id"));
  if (!id.success) redirect("/workspace");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("restaurant_id", id.data)
    .eq("status", "active")
    .maybeSingle();
  if (!data) redirect("/workspace");
  await setWorkspaceCookie(id.data);
  const wanted = formData.get("role");
  const role = data.role as AppRole;
  // A role chosen at login must still match this restaurant's membership.
  if (typeof wanted === "string" && ["waiter", "kitchen", "cashier", "manager"].includes(wanted) && !matchesLoginRole(role, wanted as LoginRole)) {
    redirect("/workspace");
  }
  redirect(ROLE_HOME[role]);
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter the restaurant name").max(120),
  phone: phoneSchema,
  address: z.string().trim().max(200),
});

export async function createRestaurant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const parsed = createSchema.safeParse(formObject(formData));
  if (!parsed.success) return fail("Check the highlighted fields.", fieldErrors(parsed.error));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let restaurantId: string | null = null;
  let lastError: unknown = null;
  // The joining code is generated only as part of creating the restaurant. A
  // collision with another restaurant's code is vanishingly rare; retry anyway.
  for (let attempt = 0; attempt < 5 && !restaurantId; attempt++) {
    const { data, error } = await supabase.rpc("create_restaurant", {
      p_name: parsed.data.name,
      p_phone: parsed.data.phone || null,
      p_address: parsed.data.address || null,
      p_join_code: generateJoinCode(),
      p_takeaway: formData.get("takeaway") === "on",
      p_trial_days: trialDays(),
    });
    if (!error && data) restaurantId = data as string;
    else if (error?.code === "23505") lastError = error;
    else return fail(errorMessage(error));
  }
  if (!restaurantId) return fail(errorMessage(lastError));

  await setWorkspaceCookie(restaurantId);
  redirect("/manager?welcome=1");
}

export async function joinRestaurant(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED);
  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!JOIN_CODE_RE.test(code)) return fail("Enter the joining code exactly as your manager gave it (it starts with SOKO).", { code: "Check the code" });
  const requested = String(formData.get("role") ?? "");
  const role = ["waiter", "kitchen", "cashier"].includes(requested) ? requested : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_join", {
    p_code: code,
    p_message: String(formData.get("message") ?? "").slice(0, 300) || null,
    p_role: role,
  });
  if (error) return fail(errorMessage(error));
  switch (data as string) {
    case "pending":
    case "already_pending":
      redirect("/pending");
    case "already_member":
      return fail(errorMessage("already_member"));
    case "access_revoked":
      return fail(errorMessage("access_revoked"));
    case "rate_limited":
      return fail(errorMessage("rate_limited"));
    default:
      return fail(errorMessage("invalid_code"), { code: "Not a valid code" });
  }
}

const profileSchema = z.object({ full_name: z.string().trim().min(2, "Enter your name").max(120), phone: phoneSchema });

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(formObject(formData));
  if (!parsed.success) return fail("Check the highlighted fields.", fieldErrors(parsed.error));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(errorMessage("not_authenticated"));
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null })
    .eq("id", user.id);
  if (error) return fail(errorMessage(error));
  return done("Profile saved.");
}
