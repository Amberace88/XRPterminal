# Security

- **Non-custodial**: no deposits, withdrawals, custody, signing or real trade execution. Seed phrases / private keys are never requested; inputs that look like secrets are rejected.
- **Exchange connections** are read-only: API permission restrictions are inspected and keys with trading/withdrawal/transfer rights are rejected. Secrets are AES-256-GCM encrypted server-side (`CREDENTIALS_ENCRYPTION_KEY`), stored in a table with no client policies, never logged or shown to admins.
- **Authorization**: Supabase RLS on every user-owned table; server routes re-check user, ownership, plan entitlements and admin role (never trusting client flags). Profile privilege fields are protected by trigger.
- **Immutability**: audit logs, forecasts, forecast evaluations, paper-trading ledgers and strategy versions are append-only.
- **AI safety**: external text (news, user input, labels, journal) is wrapped as untrusted data; AI never computes numbers; citation URLs not returned by the search tool are dropped.
- **Web**: security headers (HSTS, frame deny, nosniff, referrer policy, permissions policy), zod validation on every API input, rate limiting, structured logging with secret redaction, no stack traces to users.
- Report vulnerabilities to the contact address on the site.
