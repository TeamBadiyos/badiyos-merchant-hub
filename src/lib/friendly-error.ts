/**
 * Turns anything thrown by Razorpay, Supabase or the network into a short,
 * human sentence. Raw JSON / database codes are NEVER shown on screen.
 */

export type PaymentErrorCategory =
  | "cancelled"
  | "declined"
  | "network"
  | "upi_unavailable"
  | "unknown";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function tryJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    return asRecord(JSON.parse(t));
  } catch {
    return null;
  }
}

/** Flattens nested error/response/data/cause layers into one text blob. */
function rawText(input: unknown): string {
  const parts: string[] = [];
  let node: unknown = input;
  for (let depth = 0; depth < 6 && node != null; depth += 1) {
    if (typeof node === "string") {
      parts.push(node);
      const parsed = tryJson(node);
      if (!parsed) break;
      node = parsed;
      continue;
    }
    if (node instanceof Error) {
      parts.push(node.message);
      const next = tryJson(node.message) ?? asRecord((node as Error & { cause?: unknown }).cause);
      if (!next) break;
      node = next;
      continue;
    }
    const rec = asRecord(node);
    if (!rec) break;
    try {
      parts.push(JSON.stringify(rec));
    } catch {
      /* circular */
    }
    const nested =
      asRecord(rec["error"]) ??
      asRecord(rec["response"]) ??
      asRecord(rec["data"]) ??
      asRecord(rec["cause"]) ??
      (typeof rec["error"] === "string" ? tryJson(rec["error"]) : null) ??
      (typeof rec["message"] === "string" ? tryJson(rec["message"]) : null);
    if (!nested) break;
    node = nested;
  }
  return parts.filter(Boolean).join(" | ").slice(0, 4000);
}

const CANCEL_HINTS = [
  "payment_cancelled",
  "payment cancelled",
  "cancelled by user",
  "canceled by user",
  "user cancel",
  "dismiss",
  "back pressed",
  "user closed",
  "closed by user",
];

const DECLINE_HINTS = [
  "payment_failed",
  "payment_error",
  "payment_declined",
  "bad_request_error",
  "declined",
  "insufficient",
  "authentication",
  "card_declined",
  "do not honour",
  "do not honor",
  "limit exceeded",
  "invalid card",
  "invalid vpa",
  "expired card",
  "risk",
];

const NETWORK_HINTS = [
  "network",
  "timeout",
  "timed out",
  "connection",
  "offline",
  "unreachable",
  "failed to fetch",
  "load failed",
];

const UPI_HINTS = [
  "upi app",
  "no upi",
  "upi_app",
  "activity not found",
  "no activity found",
  "app not installed",
  "package not found",
];

function hit(hay: string, hints: string[]) {
  return hints.some((h) => hay.includes(h));
}

/** Classifies a payment failure into one of the five user-facing buckets. */
export function paymentErrorCategory(input: unknown): PaymentErrorCategory {
  const hay = rawText(input).toLowerCase();
  if (hit(hay, CANCEL_HINTS)) return "cancelled";
  if (hit(hay, UPI_HINTS)) return "upi_unavailable";
  if (hit(hay, DECLINE_HINTS)) return "declined";
  if (hit(hay, NETWORK_HINTS)) return "network";
  return "unknown";
}

/** Error thrown by the checkout helper, already classified. */
export class PaymentError extends Error {
  category: PaymentErrorCategory;
  constructor(category: PaymentErrorCategory, raw?: string) {
    super(raw || category);
    this.name = "PaymentError";
    this.category = category;
  }
}

export function toPaymentError(err: unknown): PaymentError {
  if (err instanceof PaymentError) return err;
  const raw = rawText(err);
  return new PaymentError(paymentErrorCategory(err), raw);
}

const PAYMENT_TEXT: Record<PaymentErrorCategory, { en: string; mr: string }> = {
  cancelled: {
    en: "Payment was cancelled. No money was taken.",
    mr: "पेमेंट रद्द झाले. पैसे कापले गेले नाहीत.",
  },
  declined: {
    en: "The payment did not go through. Try another method or contact your bank.",
    mr: "पेमेंट झाले नाही. दुसरी पद्धत वापरा किंवा बँकेशी संपर्क करा.",
  },
  network: {
    en: "Internet connection problem. Check your network and try again.",
    mr: "इंटरनेट कनेक्शनची अडचण. नेटवर्क तपासून पुन्हा प्रयत्न करा.",
  },
  upi_unavailable: {
    en: "No UPI app could be opened. Use a card or net banking instead.",
    mr: "कोणतेही UPI अ‍ॅप उघडले नाही. कार्ड किंवा नेट बँकिंग वापरा.",
  },
  unknown: {
    en: "Payment could not be completed. Please try again.",
    mr: "पेमेंट पूर्ण होऊ शकले नाही. कृपया पुन्हा प्रयत्न करा.",
  },
};

export function paymentErrorMessage(err: unknown, lang: "en" | "mr" = "en"): string {
  const cat = err instanceof PaymentError ? err.category : paymentErrorCategory(err);
  return PAYMENT_TEXT[cat][lang];
}

/** True when the customer simply closed the payment sheet. */
export function isPaymentCancelled(err: unknown): boolean {
  return (err instanceof PaymentError ? err.category : paymentErrorCategory(err)) === "cancelled";
}

/** Known backend error codes → plain sentences. */
const CODE_TEXT: { match: string; en: string; mr: string }[] = [
  { match: "out_of_area", en: "This address is outside the delivery area.", mr: "हा पत्ता डिलिव्हरी क्षेत्राबाहेर आहे." },
  { match: "insufficient_balance", en: "Your delivery wallet balance is too low. Please top up.", mr: "डिलिव्हरी वॉलेटमध्ये पुरेशी शिल्लक नाही. टॉप अप करा." },
  { match: "low_balance", en: "Your delivery wallet balance is too low. Please top up.", mr: "डिलिव्हरी वॉलेटमध्ये पुरेशी शिल्लक नाही. टॉप अप करा." },
  { match: "not_authorized", en: "You do not have permission for this.", mr: "यासाठी तुम्हाला परवानगी नाही." },
  { match: "permission denied", en: "You do not have permission for this.", mr: "यासाठी तुम्हाला परवानगी नाही." },
  { match: "delivery_unavailable", en: "Delivery is not available for this location right now.", mr: "या ठिकाणासाठी आता डिलिव्हरी उपलब्ध नाही." },
  { match: "delivery_not_active", en: "Your delivery account is not active. Contact badiyos.", mr: "तुमचे डिलिव्हरी खाते सक्रिय नाही. badiyos शी संपर्क करा." },
  { match: "order_not_found", en: "This order is no longer available.", mr: "ही ऑर्डर आता उपलब्ध नाही." },
  { match: "not_found", en: "We could not find that. Please refresh and try again.", mr: "ते सापडले नाही. रिफ्रेश करून पुन्हा प्रयत्न करा." },
  { match: "duplicate", en: "This already exists.", mr: "हे आधीच आहे." },
  { match: "invalid_phone", en: "Enter a valid 10-digit mobile number.", mr: "योग्य 10 अंकी मोबाइल नंबर टाका." },
  { match: "no_pickup_point", en: "Add a pickup point first.", mr: "आधी पिकअप ठिकाण जोडा." },
  { match: "no_plan", en: "Delivery plan not set, contact badiyos.", mr: "डिलिव्हरी प्लॅन सेट नाही, badiyos शी संपर्क करा." },
  { match: "jwt", en: "You were signed out. Please log in again.", mr: "तुम्ही साइन आउट झाले आहात. पुन्हा लॉग इन करा." },
];

const GENERIC = {
  en: "Something went wrong. Please try again.",
  mr: "काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा.",
};

/**
 * Any error → a short sentence a shopkeeper can act on.
 * Plain backend sentences are kept as-is; codes and JSON are translated.
 */
export function friendlyErrorMessage(err: unknown, lang: "en" | "mr" = "en"): string {
  const raw = rawText(err);
  const hay = raw.toLowerCase();

  if (hit(hay, NETWORK_HINTS)) return PAYMENT_TEXT.network[lang];
  for (const c of CODE_TEXT) if (hay.includes(c.match)) return c[lang];

  // A readable sentence from the backend (no braces, no snake_case code, has a space)
  const first = raw.split(" | ")[0]?.trim() ?? "";
  const looksTechnical =
    !first ||
    first.includes("{") ||
    first.includes("<") ||
    /^[a-z0-9_]+$/.test(first) ||
    !first.includes(" ") ||
    first.length > 160;
  if (!looksTechnical) return first;
  return GENERIC[lang];
}
