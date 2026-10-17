# SokoHotel

Mobile-first restaurant management for Kenyan restaurants, hotels and cafes. One installable web app (PWA) with four role views: Waiter, Kitchen, Cashier and Manager. It works on phones, tablets and desktops.

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Supabase (Auth, Postgres with Row Level Security, Storage, Realtime), Lucide icons.

This is a PWA, not a native app. Users open the link and use "Add to Home Screen" (or the Install button on the Account page) to get an app icon and full-screen launch.

---

## 1. What is real and what is not

Read this first. It lists exactly what works today and what still needs something from you.

**Real and working (needs only a Supabase project):**
- Email and password sign up with email verification, password reset, protected routes.
- Two sign-up paths: create a restaurant, or join with a code that a manager must approve.
- Role checks against the approved membership in the database. The role card on the login screen is only a request. Choosing "Manager" without being one signs you out with an error.
- Waiter flow: choose table, add items, review, send, confirmation, active orders, find order by number.
- Kitchen board with item-level statuses, Realtime updates and a polling fallback. Drinks and other "waiter releases" items skip the kitchen.
- Cashier: unpaid, partial and paid bills, cash and M-Pesa payments, partial payments, receipts with print and share.
- Manager: dashboard, orders, staff and joining code (rotate, switch off, QR), menu with photo upload, reports, CSV export, expenses with voiding, settings and tables, subscription status, audit log.
- Money is stored as integer minor units. Order and receipt numbers are generated on the server and cannot be guessed (for example `SH-261015-X7K9QM4D`).
- Cross-restaurant isolation is enforced by Postgres RLS and composite foreign keys, and it is tested.

**Added in v2:**
- Orange, sky-blue and red theme; landing page with the hero in a glass card over the photo; your table and chair glyphs used for tables.
- Tables always open an order. A table being occupied never blocks a new order.
- Faster navigation: fewer database round trips per page, loading skeletons, and a short client-side page cache.
- Offline: pages you have already opened while signed in still open offline (last-seen data, with a banner). Anything that changes data (sending an order, taking a payment) needs a connection and its button is switched off while offline. Cached pages are wiped on sign out.
- Subscription payments by M-Pesa STK push: the manager picks a month count, approves on their phone, and the subscription extends by itself. New restaurants get a **7-day free trial** (`TRIAL_DAYS`), then **KSh 3,000 per month** (plan seeded by migration 0010).
- Optional "Add sample menu and tables" button shown only while the menu is empty. It creates no orders or sales.

**Not automated, by design or not built yet:**
- **Customer payments at the restaurant are manual.** The cashier types the M-Pesa confirmation code; it is stored as Unverified until a manager verifies it against the statement. (STK push is used only for SokoHotel's own subscription, below.)
- **Subscription M-Pesa (STK push) is written but untested against Safaricom.** It needs Daraja credentials, a deployed HTTPS URL, and `MPESA_CALLBACK_SECRET` (see `.env.example`). Until those are set the Pay button is off and says so. The callback is secret-in-URL, checked against an STK Query, amount-checked and idempotent, and each M-Pesa receipt can extend a subscription only once. Try it in the Daraja sandbox first.
- **"Estimated profit"** is sales minus recorded expenses. Stock cost is not tracked, so it is not true profit, and the app says so.
- Email and SMS alerts are not built. Notification settings only control what shows in the app.
- Offline ordering is not supported (orders need a connection so they are never lost or duplicated).
- Currency is KES only.
- Realtime updates need the `orders` table in the Supabase Realtime publication. The migrations do this.

---

## 2. Setup

Requirements: Node 20.9 or newer (Node 22 recommended), npm 10, a free Supabase project.

### 2.1 Install

```powershell
cd sokohotel
npm install
```

### 2.2 Create the Supabase project

1. Create a project at supabase.com.
2. In Project Settings, then API, copy the Project URL, the anon key and the service role key.
3. Create your local environment file. **Use `.env.local`, never `.env`:**

```powershell
Copy-Item .env.example .env.local
```

4. Fill `.env.local`. `.env.local` is git-ignored. **If a key was ever committed or pasted anywhere public, rotate it now in the Supabase dashboard (Project Settings, API) and update `.env.local`.** The service role key bypasses all security and must only ever exist on the server. It is never prefixed with `NEXT_PUBLIC_`.

### 2.3 Run the migrations

In the Supabase dashboard, open SQL Editor and run the files in `supabase/migrations/` **in order**, 0001 to 0010. Or with the Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

The migrations create the tables, row level security, the database functions that perform all writes, the storage buckets and policies, and the Realtime publication. They add **no demo data**: a new restaurant starts empty.

### 2.4 Configure Auth

In Authentication, then URL Configuration:
- Site URL: your deployed URL (for local work, `http://localhost:3000`).
- Redirect URLs: add `http://localhost:3000/auth/callback` and `https://YOUR-DOMAIN/auth/callback`.

In Authentication, then Providers, keep Email enabled and **Confirm email turned on**. The default Supabase mail sender is rate-limited and suitable only for testing. For production, add your own SMTP provider under Authentication, then SMTP Settings.

### 2.5 Run

```powershell
npm run dev
```

Open http://localhost:3000. Create an account, create a restaurant, then add your menu and tables from the Manager screens. Until the Supabase variables are set, the login and sign-up pages show a "Database not connected" notice and stay disabled.

---

## 3. Roles and access

| Role | Can do |
| --- | --- |
| Waiter | Create orders, see own orders, serve ready items |
| Kitchen | See all orders, prepare and mark items ready |
| Cashier | See bills, take and receipt payments |
| Manager and Owner | Everything above, plus staff, menu, reports, expenses, settings, audit, reversing payments, verifying M-Pesa codes |

Managers can open the Waiter, Kitchen and Cashier views. Other roles cannot open Manager pages.

Joining codes are unique, can be replaced or switched off at any time, and guesses are rate-limited. A code only creates a pending request. Nobody gets access until a manager approves them.

---

## 4. Security notes

- Every table has Row Level Security. Privileges are revoked from `anon` and `authenticated`, then granted back narrowly (column-level on `restaurants` and `profiles`).
- All business writes happen in `SECURITY DEFINER` functions that read `auth.uid()`, verify membership and role, check the subscription is writable, and raise short error codes. Browser input never decides the restaurant or the role.
- `restaurants.join_code` cannot be selected directly. Managers read it through an audited function.
- Prices, names and fulfilment type are snapshotted onto order lines on the server from the menu, so a changed price never alters an old bill.
- Orders and payments use idempotency keys, so a double tap or a retry never creates a duplicate.
- Payments are reversed, never deleted. Expenses are voided with a reason, never deleted. Audit logs cannot be edited.
- Menu photos and expense receipts are in private buckets and shown through short-lived signed URLs. Object paths must start with the restaurant's own id.
- `SUPABASE_SERVICE_ROLE_KEY` is used only by the server-side rate limiter. If it is missing, the limiter falls back to in-memory counters. That works for one server but is not shared between serverless instances, so set the key in production.
- The login redirect only accepts same-site paths. Sign-up and password reset give the same response whether or not an account exists.
- Security headers are set in `next.config.mjs`.

---

## 5. Tests

```powershell
npm run typecheck
npm test
```

- `tests/unit/`: money, references, validation and date helpers.
- `tests/db/`: the real SQL migrations run in an in-memory Postgres (PGlite) with a small Supabase shim. They cover cross-restaurant isolation, join-code rules and rate limiting, order creation and statuses, payments (partial, overpayment, duplicate M-Pesa codes, reversal), expenses, subscription read-only mode and reports.

These tests do not call Supabase Auth, Storage or Realtime. Test those against your own project after deploying (section 8).

---

## 6. Deploying

Any host that runs Next.js works. Vercel is the simplest:

1. Push the repository to GitHub. Check that no `.env` or `.env.local` file is included.
2. Import it in Vercel.
3. Add the environment variables from `.env.example` (Production and Preview).
4. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS URL, then add that URL and `/auth/callback` to Supabase Auth redirect URLs.
5. Deploy, then open the site on a phone and use Add to Home Screen.

PWA requirements: HTTPS (automatic on Vercel), `manifest.webmanifest`, icons in `public/icons` and `public/sw.js`. The service worker never caches private data or API responses.

---

## 7. Operating subscriptions

New restaurants get a free trial (`TRIAL_DAYS`, default 7). The standard plan is KSh 3,000 per month, stored as data (`price_minor = 300000`). Change it any time in the SQL editor:

```sql
update subscription_plans set price_minor = 350000 where code = 'monthly';
```

Managers pay from Manager, then Subscription. Paying early adds to the time left; it never discards it. When a trial or period ends, the restaurant gets a grace period (7 days), then becomes read-only. It can still view and export everything, and data is never deleted for non-payment. If you must adjust one by hand (for example a cash payment to you):

```sql
update subscriptions set status = 'active', current_period_end = now() + interval '30 days'
where restaurant_id = 'RESTAURANT-UUID';
```

All subscription changes are written to the audit log.

## 8. Checks to do on your own project before real use

Automated tests cannot cover these, so do them once after deploying:

1. Sign up, confirm the email link, sign in.
2. Create a restaurant. Add a category, an item with a photo, and tables.
3. Sign up a second account, join with the code, approve it as Waiter. Check that the Waiter role card works for that account and the Manager card is refused.
4. Place an order as the waiter. Watch it appear on the Kitchen board without refreshing, then mark it ready and served.
5. Take a part payment in cash and an M-Pesa payment with a test code. Open the receipt, print it, reverse one payment as a manager.
6. Create a second restaurant with another account and confirm it cannot see the first one's data.
7. Install the app on a phone, open a few screens, then go to airplane mode: those screens should still open with an offline banner.
8. Subscription payment: in the Daraja sandbox, pay from the Subscription page and confirm the end date moves once.

---

## 9. Project layout

```
src/app/            routes (landing, auth, waiter, kitchen, cashier, manager) and server actions
src/components/     UI, role screens and forms
src/lib/            money, references, validation, session, rate limiting, helpers
supabase/migrations SQL: schema, RLS, functions, storage
tests/              unit and database tests
public/             brand assets, icons, landing photos, service worker
scripts/            build-assets.py regenerates icons and cropped photos from design-assets/source
```

Brand colours live in one place (`src/app/globals.css` and `tailwind.config.ts`): orange #C2410C and #F97316, sky #E0F2FE, red #FF5A4F, ink #1F2937, muted #64748B, canvas #F8FAFC, line #DBE3EA, success #15803D, danger #B91C1C, warn #B45309.
