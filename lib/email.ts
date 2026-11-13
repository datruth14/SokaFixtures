import { Resend } from "resend";

export async function sendEmail(options: { to: string; subject: string; text: string; idempotencyKey?: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) throw new Error("Resend email is not configured.");
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({
    from,
    to: [options.to],
    subject: options.subject,
    text: options.text,
  }, options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined);
  if (error || !data) throw new Error("Email delivery failed.");
  return data;
}
