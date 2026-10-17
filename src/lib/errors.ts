/**
 * Database functions raise short stable codes. This maps them to messages a
 * restaurant worker can act on. Unknown errors are never shown raw: they may
 * contain internal detail.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Your session has ended. Please sign in again.",
  forbidden: "You do not have permission to do that.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  invalid_code: "That joining code is not valid. Check it with your manager.",
  already_member: "You already belong to that restaurant.",
  access_revoked: "Your access to that restaurant was removed. Please contact the manager.",
  already_pending: "Your request is already waiting for approval.",
  already_decided: "That request has already been handled.",
  not_found: "That record could not be found.",
  invalid_role: "That role cannot be assigned.",
  cannot_change_self: "You cannot change your own role.",
  subscription_inactive:
    "This restaurant's subscription is not active, so changes are paused. Your data is safe and can still be viewed and exported.",
  invalid_location: "That table is not available. Please choose another.",
  empty_order: "Add at least one item before sending the order.",
  too_many_items: "An order can have at most 50 lines.",
  invalid_item: "One of the items could not be read. Please refresh and try again.",
  item_unavailable: "One of the items is no longer available. Remove it and try again.",
  invalid_quantity: "Quantities must be between 1 and 99.",
  invalid_transition: "That change is not allowed for this item right now.",
  order_has_payments: "Payments have already been taken on this order, so items cannot be cancelled.",
  order_cancelled: "This order was cancelled.",
  already_paid: "This bill is already fully paid.",
  invalid_amount: "Enter an amount greater than zero.",
  overpayment: "That amount is more than the remaining balance.",
  invalid_transaction_ref: "Enter the 10-character M-Pesa confirmation code (letters and numbers).",
  duplicate_transaction_ref: "That M-Pesa code has already been used for another payment.",
  already_reversed: "That payment has already been reversed.",
  reason_required: "Please give a short reason (at least 3 characters).",
  payment_in_progress: "A payment prompt was just sent. Wait a minute for it, then try again.",
  invalid_phone: "Use a Safaricom number like 0712 345 678.",
  invalid_range: "Choose a valid date range (up to 366 days).",
};

export function errorMessage(raw: unknown): string {
  const text = typeof raw === "string" ? raw : ((raw as { message?: string } | null)?.message ?? "");
  const code = text.trim();
  if (MESSAGES[code]) return MESSAGES[code];
  if (/row-level security|permission denied/i.test(code)) return MESSAGES.forbidden;
  if (/duplicate key|unique constraint/i.test(code)) return "That already exists.";
  if (/fetch failed|network|timeout/i.test(code)) return "Could not reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Free-form payload for the client, for example a created id. */
  data?: Record<string, string | number | boolean | null>;
}

export const initialState: ActionState = { ok: false };

export function fail(message: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, message, fieldErrors };
}

export function done(message?: string, data?: ActionState["data"]): ActionState {
  return { ok: true, message, data };
}
