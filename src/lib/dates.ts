const DEFAULT_TZ = "Africa/Nairobi";

export function formatTime(iso: string | Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-KE", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(iso))
    .toUpperCase();
}

export function formatDate(iso: string | Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-KE", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string | Date, tz = DEFAULT_TZ): string {
  return `${formatDate(iso, tz)}, ${formatTime(iso, tz)}`;
}

export function formatLongDate(iso: string | Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** YYYY-MM-DD for a moment, as seen in a time zone. */
export function localDateString(d: Date | string, tz = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(d),
  );
  return parts; // en-CA gives YYYY-MM-DD
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isDateString(v: string | undefined | null): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  // Round-trip so impossible dates such as 2026-02-30 are rejected, not rolled over.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "4 min", "1 hr 5 min" */
export function elapsed(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function greeting(tz = DEFAULT_TZ, now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hour12: false }).format(now));
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function tzOffsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** The instant a calendar day (YYYY-MM-DD) begins in the given time zone, as an ISO string. */
export function startOfDayISO(dateStr: string, tz = DEFAULT_TZ): string {
  const guess = Date.parse(`${dateStr}T00:00:00Z`);
  let ts = guess - tzOffsetMs(guess, tz);
  ts = guess - tzOffsetMs(ts, tz); // second pass settles days with a UTC offset change
  return new Date(ts).toISOString();
}

export function todayStartISO(tz = DEFAULT_TZ, now = new Date()): string {
  return startOfDayISO(localDateString(now, tz), tz);
}
