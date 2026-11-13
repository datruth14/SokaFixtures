import { databaseClient } from "../db";
import { sendEmail } from "../email";

export async function queueBillingEmail(eventKey: string, recipient: string, subject: string, body: string) {
  await databaseClient().execute({
    sql: "INSERT OR IGNORE INTO billing_email (event_key, recipient, subject, body, state, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
    args: [eventKey, recipient, subject, body, Date.now()],
  });
}

export async function deliverBillingEmail(eventKey: string) {
  const db = databaseClient();
  const result = await db.execute({ sql: "SELECT recipient, subject, body, state FROM billing_email WHERE event_key = ?", args: [eventKey] });
  const email = result.rows[0];
  if (!email || email.state === "sent") return;
  await sendEmail({ to: String(email.recipient), subject: String(email.subject), text: String(email.body), idempotencyKey: eventKey });
  await db.execute({ sql: "UPDATE billing_email SET state = 'sent', sent_at = ? WHERE event_key = ? AND state = 'pending'", args: [Date.now(), eventKey] });
}
