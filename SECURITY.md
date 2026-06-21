# ShopHero — Security & Spend Protection

## Spend defense gates (built in)
Checked before every managed turn (`app/lib/spend-guard.server.ts`); all tunable in `.env`, `0` disables a gate:

| Gate | Env | Default | Protects |
|---|---|---|---|
| Per-shop / day | `DRIFT_CAP_SHOP_DAILY_USD` | $25 | the merchant + you |
| Per-shop / month | `DRIFT_CAP_SHOP_MONTHLY_USD` | $250 | the merchant + you |
| Global / day (managed) | `DRIFT_CAP_GLOBAL_DAILY_USD` | $200 | **you** (backstop on your Anthropic credits) |
| Concurrent turns / instance | `DRIFT_MAX_CONCURRENT` | 4 | instance RAM/CPU |
| Per-turn ceiling | `DRIFT_MAX_TURNS` | 16 | runaway single turn |

Plus: **model routing** (cheap-first, escalate only on need), **key-pool failover** (a dry key rolls to the next, with cooldowns), **prompt size cap** (8000 chars), and the **mutation approval gate** (live store writes need explicit approval). BYOK shops are measured by raw cost (their key); managed shops by billed $.

## Data protection (built in)
- **BYOK keys** encrypted at rest with **AES-256-GCM** (`DRIFT_ENCRYPTION_KEY`, 32-byte hex).
- **Shopify sessions** in the DB via the official Prisma session storage.
- **Webhooks** (incl. the 3 GDPR compliance topics) are **HMAC-verified** by `authenticate.webhook`.
- **Admin console** (`/admin`): timing-safe password check + a signed, httpOnly cookie; locked entirely if `ADMIN_PASSWORD` is unset.
- **Minimal scopes**: `write_products,write_themes,write_content` only.
- **Logs** mask keys (only the last 6 chars) and never print secrets.

## Production hardening checklist
1. **Switch to Postgres** (see below) — SQLite won't survive a redeploy or scale.
2. **Strong secrets, rotated**: regenerate `DRIFT_ENCRYPTION_KEY` and `ADMIN_PASSWORD`; store all secrets in Railway's env vars (never commit — `.env` is gitignored). Losing `DRIFT_ENCRYPTION_KEY` makes stored BYOK keys unrecoverable.
3. **Sandbox the agent (highest priority).** The agent has a `Bash` tool = shell execution on your server. For multi-tenant production, run each turn in an isolated container/VM, or set `DRIFT_ALLOW_BASH=false` to drop it. Per-shop workspaces are separate dirs, but they share the host.
4. **Lock down `/admin`**: strong password, ideally an IP allowlist or VPN; it exposes cross-shop data.
5. **TLS everywhere**: Railway terminates HTTPS; use Supabase with `sslmode=require`.
6. **Shared state for scale**: the per-shop agent-session map and key cooldowns are in-process — move to Postgres/Redis before running multiple replicas.
7. **App Store**: submit the theme-write exemption; publish a privacy policy listing Anthropic as a subprocessor; flip off dev bypasses (`DRIFT_DEV_PLAN`, `test: true` billing).

## Switching to Supabase Postgres
1. In `prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` to your Supabase **pooler** connection string (port 6543, `?sslmode=require&pgbouncer=true`).
3. Reset migrations for the new provider: delete the `prisma/migrations/` folder, then:
   ```bash
   npx prisma migrate dev --name init
   ```
4. Deploy to Railway with the same env vars. Run `npx prisma migrate deploy` on release (the `setup` script already does this).

> This replaces the local SQLite dev DB — do it once your Supabase URL is ready (local dev will then also use Postgres).
