# Backups & Disaster Recovery

| Item | Mechanism | Frequency |
|---|---|---|
| Database | Supabase automated daily backups (PITR recommended on paid plan) | daily / continuous |
| Schema | `supabase/migrations/` in Git | every change |
| Configuration | Netlify env vars exported to a password manager | on change |
| Code | GitHub | every push |

**Targets (suggested):** RPO ≤ 24h (≤ 5 min with PITR), RTO ≤ 4h.

**Restore:** 1) restore the Supabase backup / PITR to a new project, 2) re-apply any migrations newer than the backup, 3) update Netlify env vars to the restored project, 4) redeploy, 5) run `/api/health/providers` and the forecast jobs, 6) record the incident in the audit log.

Jobs are idempotent (forecast publish uses a unique content hash; evaluations are one-per-forecast), so re-running after recovery is safe.
