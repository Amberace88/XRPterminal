# Deployment

## Environments
- **development** — `npm run dev`, `.env.local`, optional separate Supabase project / Supabase branch.
- **staging** — Netlify deploy previews / branch deploys with a staging Supabase project (never run destructive migrations against production first).
- **production** — Netlify production context + production Supabase project.

## Netlify
1. Connect the GitHub repo; build command `npm run build`, publish `.next` (see `netlify.toml`, `@netlify/plugin-nextjs`).
2. Environment variables (Site → Environment): see `.env.example`. Required for full functionality:
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
   optional `ANTHROPIC_API_KEY`, `STRIPE_*`, `CREDENTIALS_ENCRYPTION_KEY`, `RESEND_API_KEY`.
3. Scheduled functions (`netlify/functions/*.mts`): `forecast-daily` (00:15 UTC), `forecast-evaluate` (00:45 UTC), `alerts-check` (every 5 min).
   They call `/api/jobs/*` with `x-cron-secret`.

## Supabase
1. Run the SQL files in `supabase/migrations/` in order (SQL editor or `supabase db push`).
2. Auth → URL configuration: Site URL = production URL; redirect URLs include `https://<domain>/auth/callback`.
3. Make yourself admin: `update public.profiles set role='admin' where email='you@example.com';`

## Stripe
Create two monthly prices (Pro €9.99, Pro+ €19.99) → `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PROPLUS_MONTHLY`.
Webhook endpoint `https://<domain>/api/billing/webhook` with events `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed` → `STRIPE_WEBHOOK_SECRET`.

## Launch checklist (spec §348)
Domain & SSL · Auth + email verification · Migrations + RLS advisors clean · Market/XRPL data live · Forecast publish job ran · AI key (optional) ·
Stripe test → live · Admin role set · Legal pages **reviewed by qualified legal counsel** · Privacy/cookies · Backups enabled · Monitoring · Mobile QA · Accessibility pass.
