import { Capacitor } from "@capacitor/core";

export type RazorpayCheckoutOptions = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  description: string;
  notes?: Record<string, string>;
};

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
  if (Capacitor.isNativePlatform()) {
    const { Checkout } = await import("capacitor-razorpay");
    try {
      const res = (await Checkout.open({
        key: opts.keyId,
        order_id: opts.orderId,
        amount: String(opts.amountPaise),
        currency: "INR",
        name: "badiyos",
        description: opts.description,
        prefill: {},
        notes: opts.notes ?? {},
        theme: { color: "#800080" },
      })) as { response?: { razorpay_payment_id?: string } };
      const paymentId = res?.response?.razorpay_payment_id;
      if (!paymentId) throw new Error("Payment could not be confirmed");
      return paymentId;
    } catch (e) {
      const msg = (e as { description?: string; message?: string })?.description ?? (e as Error)?.message;
      throw new Error(msg || "Payment was cancelled");
    }
  }

  if (!(await loadWebCheckout())) throw new Error("Payment page could not load. Check your internet.");
  const Rzp = (window as RzpWindow).Razorpay!;
  return new Promise((resolve, reject) => {
    const rzp = new Rzp({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountPaise,
      currency: "INR",
      name: "badiyos",
      description: opts.description,
      notes: opts.notes ?? {},
      theme: { color: "#800080" },
      handler: (resp: { razorpay_payment_id?: string }) =>
        resp.razorpay_payment_id ? resolve(resp.razorpay_payment_id) : reject(new Error("Payment could not be confirmed")),
      modal: { ondismiss: () => reject(new Error("Payment was cancelled")) },
    });
    rzp.on("payment.failed", () => reject(new Error("Payment failed. Try again.")));
    rzp.open();
  });
}
