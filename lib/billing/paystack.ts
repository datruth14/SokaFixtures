import { MONTHLY_AMOUNT } from "./policy";

type PaystackEnvelope<T> = { status: boolean; message?: string; data: T };

export class PaystackError extends Error {
  constructor(message: string, public definitive: boolean) { super(message); }
}

export function billingConfiguration() {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const plan = process.env.PAYSTACK_PLAN_CODE;
  const baseUrl = process.env.BETTER_AUTH_URL;
  if (!secret || !plan || !baseUrl) {
    throw new Error("Billing is not configured.");
  }
  if (!/^sk_(test|live)_/.test(secret) || !plan.startsWith("PLN_")) throw new Error("Billing is not configured.");
  return { secret, plan, baseUrl: new URL(baseUrl).origin, domain: secret.startsWith("sk_live_") ? "live" : "test" };
}

export async function paystack<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const { secret } = billingConfiguration();
  let response: Response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      method: options.method ?? "GET",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new PaystackError("Payment provider unavailable.", false);
  }
  const result = await response.json().catch(() => null) as PaystackEnvelope<T> | null;
  if (!response.ok || !result?.status || !result.data) {
    throw new PaystackError("Payment provider request failed.", response.status >= 400 && response.status < 500 && response.status !== 429);
  }
  return result.data;
}

export interface PaystackPlan { plan_code: string; amount: number; currency: string; interval: string; domain: string }
export interface PaystackTransaction {
  status: string; reference: string; amount: number; currency: string; domain: string; channel: string;
  paid_at: string | null;
  customer: { id: number; customer_code: string; email: string };
  authorization: { authorization_code: string; reusable: boolean; channel: string };
  plan_object?: { plan_code?: string } | null;
}
export interface PaystackSubscription {
  subscription_code: string; domain: string; status: string; next_payment_date: string | null;
  customer: { customer_code: string; email: string } | number;
  plan: PaystackPlan | number;
}

export async function validatePlan(): Promise<void> {
  const config = billingConfiguration();
  const plan = await paystack<PaystackPlan>(`/plan/${encodeURIComponent(config.plan)}`);
  if (plan.plan_code !== config.plan || plan.amount !== MONTHLY_AMOUNT || plan.currency !== "NGN" || plan.interval !== "monthly" || plan.domain !== config.domain) {
    throw new Error("Paystack plan must be an NGN 5,000 monthly plan in the same mode as the API key.");
  }
}
