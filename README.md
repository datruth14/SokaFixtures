# SokaFix

Next.js football fixtures and accumulator app. Requires Node.js 20.9 or newer.

## Premium subscriptions

> **Payments are currently disabled.** `PAYMENTS_ENABLED` in `lib/features.ts` is `false`, so every signed-in user has free access. Checkout, confirmation, management, webhook and billing-email routes return `410`, the daily cron is removed from `vercel.json`, and `/billing` shows a simple free-access account page. The billing code and database tables remain in place; set the flag to `true` to re-enable the flow described below.

This integration is **not ready for live charges until it has been configured and tested end to end with your own Paystack test account**. New checkout is disabled by default. All fixture and prompt APIs require a verified account and an active trial or paid entitlement, so an unconfigured deployment will not give access to the app.

The current offer is a seven-day trial. Paystack collects a **₦50 card verification charge**; SokaFix requests a full refund and schedules a ₦5,000/month subscription after the trial. The customer explicitly consents to recurring billing and can use Paystack's hosted subscription-management page to cancel. The bank may take time to return the verification charge. SokaFix never receives or stores raw card details.

### Configure

1. Create a dedicated Turso **libSQL** database. Review `db/migrations/0001_accounts_and_billing.sql` before applying it to an existing database: it creates tables named `user`, `session`, `account`, `verification`, `rateLimit`, and `billing_*`.
2. Copy `.env.example` to `.env.local` and set the Turso URL and token, `BETTER_AUTH_URL`, and a high-entropy `BETTER_AUTH_SECRET` of at least 32 characters. Use HTTPS for deployed URLs. Do not commit secrets or paste them into chats.
3. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` with a verified Resend domain. Subscription and password-reset emails depend on it. Email verification at signup is currently disabled, so registration and sign-in do not require Resend. Set a random `CRON_SECRET` of at least 32 characters for Vercel's daily email retry and trial reminders.
4. In **Paystack test mode**, create a monthly plan for **NGN 500,000 kobo (₦5,000)**. Set its `PAYSTACK_PLAN_CODE` and the matching test `PAYSTACK_SECRET_KEY`. The server checks the plan amount, currency, interval and mode before starting checkout.
5. Apply the database migration to the intended database, for example using a locally configured `.env.local`:

   ```sh
   node --env-file=.env.local scripts/migrate.mjs
   ```

6. Set the same environment variables in Vercel. Register `https://YOUR_DOMAIN/api/billing/webhook` in the matching Paystack test dashboard. If your account uses Paystack's newer webhook signing secret, set `PAYSTACK_WEBHOOK_SECRET`; otherwise the legacy signature is verified using the Paystack secret key.
7. Set `BILLING_ENABLED=true` **for test mode only** and redeploy. The bundled Vercel cron calls `/api/cron/billing-emails` daily, authenticated with `CRON_SECRET`. Confirm that the deployment plan supports the configured cron and monitor pending emails; one run sends at most 100 messages.

### Test before enabling live billing

- Verify account registration, sign-in, sign-out and password reset.
- With Paystack test cards, confirm the ₦50 verification succeeds, a full refund is requested and processed, the trial lasts at least seven days, and the first ₦5,000 debit is actually scheduled **after** the trial. Verify the next monthly renewal too.
- Test cancelling before renewal, payment failure and card update, expired access, a returning subscriber, interrupted checkout, repeated callbacks, and duplicate or out-of-order webhooks. Check that no user receives two subscriptions or charges.
- Verify signed webhooks, email delivery, the daily cron, and customer access from multiple browsers/devices. Ensure the app's domain, verified Resend domain and Paystack configuration are correct for production.
- Only after those checks and a review of applicable payment, subscription and consumer rules, configure the matching live plan and live keys, then explicitly set `PAYSTACK_ALLOW_LIVE=true` and `BILLING_ENABLED=true`.

Changing `BILLING_ENABLED` to `false` stops **new checkouts**, but it does not cancel existing Paystack subscriptions. Keep webhook and email credentials configured while any subscriptions remain active.

### Recovery and limitations

- Paystack does not automatically retry a failed subscription charge during the same billing cycle. Customers can use the hosted management link to update their card; support may need to help them reactivate after cancellation.
- If a refund or subscription request has an unknown outcome, the account is set to `needs_review` and is not retried automatically. Check Paystack before taking any action: the refund reference is `refund-` followed by the SokaFix transaction reference. Verify whether a refund or subscription already exists before retrying or creating another one.
- Trial eligibility is currently enforced **per account/email**, not per person or card. Additional anti-abuse checks and an operational support process may be needed before launch.
- A Paystack callback alone never grants access. The server verifies the transaction, plan, card authorization and subscription schedule; later paid access requires a verified payment event. Subscription emails are queued and retried by webhook delivery or the daily cron.
- Paystack, Turso and Resend credentials were not available during local development, so the provider interactions have only been tested with mocks. No live billing should be enabled until real test-mode verification is complete.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run build
```

The test suite uses local SQLite files in the system temporary directory's `opencode` folder for billing integration tests and mocks Paystack and Resend requests; it does not create real charges.
