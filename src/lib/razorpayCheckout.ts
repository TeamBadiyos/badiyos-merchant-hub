import { Capacitor } from "@capacitor/core";
import { PaymentError, toPaymentError } from "./friendly-error";

export type RazorpayCheckoutOptions = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  description: string;
  notes?: Record<string, string>;
  /** Logged-in merchant details, so Razorpay never asks for contact again. */
  prefill?: { name?: string; contact?: string; email?: string };
};

/** "+91XXXXXXXXXX" from any stored phone shape, or undefined. */
export function toRazorpayContact(phone?: string | null): string | undefined {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  return `+91${digits.slice(-10)}`;
}

function buildPrefill(p: RazorpayCheckoutOptions["prefill"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (p?.name) out["name"] = p.name;
  if (p?.contact) out["contact"] = p.contact;
  if (p?.email) out["email"] = p.email;
  return out;
}


type RzpWindow = Window & {
  Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void };
};

function loadWebCheckout(): Promise<boolean> {
  const w = window as RzpWindow;
  if (w.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Opens Razorpay checkout. On the native app it uses the Capacitor Razorpay
 * plugin; in the browser it falls back to the web checkout.js script.
 * Resolves with the payment id on success, rejects on cancel/failure.
 */
export async function openRazorpayCheckout(opts: RazorpayCheckoutOptions): Promise<string> {
  const prefill = buildPrefill(opts.prefill);

  if (Capacitor.isNativePlatform()) {
    const { Checkout } = await import("capacitor-razorpay");
    try {
      const options: Record<string, unknown> = {
        key: opts.keyId,
        order_id: opts.orderId,
        amount: String(opts.amountPaise),
        currency: "INR",
        name: "badiyos",
        description: opts.description,
        prefill,
        notes: opts.notes ?? {},
        theme: { color: "#800080" },
      };
      const res = (await Checkout.open(options as Parameters<typeof Checkout.open>[0])) as {
        response?: { razorpay_payment_id?: string };
      };
      const paymentId = res?.response?.razorpay_payment_id;
      if (!paymentId) throw new PaymentError("unknown");
      return paymentId;
    } catch (e) {
      throw toPaymentError(e);
    }
  }

  if (!(await loadWebCheckout())) throw new PaymentError("network");
  const Rzp = (window as RzpWindow).Razorpay!;
  return new Promise((resolve, reject) => {
    // A dialog that was open just before this point can leave the page
    // non-interactive; make sure the payment window can receive taps.
    const prevPointer = document.body.style.pointerEvents;
    document.body.style.pointerEvents = "auto";
    document.body.removeAttribute("aria-hidden");
    const restore = () => {
      document.body.style.pointerEvents = prevPointer;
    };
    const done = (id: string) => {
      restore();
      resolve(id);
    };
    const fail = (e: PaymentError) => {
      restore();
      reject(e);
    };
    const rzp = new Rzp({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountPaise,
      currency: "INR",
      name: "badiyos",
      description: opts.description,
      prefill,
      notes: opts.notes ?? {},
      theme: { color: "#800080" },
      handler: (resp: { razorpay_payment_id?: string }) =>
        resp.razorpay_payment_id
          ? done(resp.razorpay_payment_id)
          : fail(new PaymentError("unknown")),
      modal: {
        escape: true,
        backdropclose: false,
        ondismiss: () => fail(new PaymentError("cancelled")),
      },
    });
    rzp.on("payment.failed", () => fail(new PaymentError("declined")));
    rzp.open();
  });
}

