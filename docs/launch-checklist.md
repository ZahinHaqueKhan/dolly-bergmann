# Pre-launch checklist

The 10 items from PLAN.md §7.8. Each must be checked off before
shipping to production.

## 1. ☐ All P0 features working in production

- [ ] **B2C:** register, login, browse, cart, checkout, Stripe,
      order history, order tracking
- [ ] **B2B:** signup, admin approval, catalog browse, RFQ
      (cart + CSV), admin price + send, accept, mark paid, ship
      with tracking, deliver
- [ ] **AI chatbot:** loads, rate-limited, PII-stripped, refusal
      detection, B2B FAQ addendum, never 500s on SAIA failure
- [ ] **Admin:** dashboard, products CRUD, image upload, JSON
      import, coupons CRUD, orders list/status/refund, chatbot
      logs, audit log
- [ ] **SEO:** sitemap.xml generated, robots.txt correct,
      Product + BreadcrumbList JSON-LD, OpenGraph, canonical
- [ ] **Accessibility:** keyboard-navigable forms, ARIA labels on
      interactive elements, 404 page with search, error boundary

## 2. ☐ Real Stripe keys (live mode) configured

- [ ] `STRIPE_SECRET_KEY` set to a live key (`sk_live_...`)
- [ ] `STRIPE_PUBLIC_KEY` set to the live publishable key
- [ ] `STRIPE_WEBHOOK_SECRET` set to the production webhook
- [ ] Webhook endpoint registered in Stripe dashboard pointing
      at `https://api.modestwear.com/api/webhooks/stripe`
- [ ] Test the live webhook with a small `$1` test charge

## 3. ☐ Real SAIA API key configured

- [ ] `SAIA_API_KEY` set to a production key from GWDG's
      AcademicCloud
- [ ] Verify the chatbot can answer a real question end-to-end
- [ ] Verify the wholesale FAQ addendum is loaded for approved
      wholesale users

## 4. ☐ Resend domain verified

- [ ] (Phase 6) Resend domain verified at
      https://resend.com/domains
- [ ] DKIM + SPF + DMARC records in DNS
- [ ] Test a welcome email sends + arrives
- [ ] Test a refund + wholesale order email end-to-end

## 5. ☐ Sentry receiving test events

- [ ] Sentry project created, DSN set as `SENTRY_DSN`
- [ ] `sentry-sdk[fastapi]` installed in `backend/requirements.txt`
- [ ] `@sentry/nextjs` installed in `frontend/package.json`
- [ ] Backend init uncommented in `backend/app/main.py`
- [ ] Source maps uploaded on build
- [ ] Slack/email alert configured for new error types
- [ ] Trigger a 500 in dev → verify it shows up in Sentry

## 6. ☐ Backup strategy verified

- [ ] Managed Postgres (Neon / Supabase / RDS) with
      point-in-time recovery enabled
- [ ] Daily automated snapshot, 30-day retention
- [ ] Restore drill: a fresh DB can be hydrated from snapshot
      + alembic upgrade head
- [ ] Redis persistence enabled (`appendonly yes` on managed
      Redis) OR accept that rate-limit state is rebuilt on
      restart (acceptable for v1)

## 7. ☐ Privacy policy, terms of service, return policy published

- [ ] `/legal/privacy` page with the actual policy text
- [ ] `/legal/terms` page
- [ ] `/returns` page (already exists, but verify the policy text
      matches the legal copy)
- [ ] Footer links to all three pages from every page
- [ ] Sign-up form has a checkbox: "I agree to the terms and
      privacy policy"

## 8. ☐ Cookie consent banner

- [ ] Banner shows on first visit, blocks the page until accepted
- [ ] Categories: strictly necessary (always on), analytics
      (optional), marketing (optional)
- [ ] "Reject all" is a single click
- [ ] Preferences are saved to localStorage
- [ ] GA / Meta Pixel only fire after consent
- [ ] (Recommended) OneTrust or Cookiebot for compliance, but
      not required for v1 if a self-built banner is correct

## 9. ☐ GDPR / CCPA compliance review

- [ ] Data export endpoint (`GET /api/account/export` returning
      the user's data as JSON)
- [ ] Account deletion endpoint (`DELETE /api/account`) with a
      30-day grace period
- [ ] Marketing email unsubscribe link in every email footer
- [ ] "Do not sell my personal information" link in the footer
      (CCPA)
- [ ] DPA signed with all data processors (Stripe, Resend,
      hosting, analytics)

## 10. ☐ Load test: 100 concurrent users can browse + checkout

- [ ] k6 / Locust script: 100 VUs on `/shop` and `/product/<slug>`
      for 5 minutes
- [ ] p95 latency < 500 ms for catalog pages
- [ ] p95 latency < 1.5 s for checkout
- [ ] Zero 5xx during the run
- [ ] Postgres connection pool sized for the load
      (`pool_size=20, max_overflow=10` is a safe default)
- [ ] CDN caching verified for static assets (Next.js /\_next/*)

## 11. ☐ B2B smoke test: apply → approve → quote → accept → paid → shipped

Run the full B2B happy path against production. Use the seeded
admin user plus a test wholesale buyer.

```bash
bash scripts/test_phase4.5.sh
```

Every assertion must pass against the prod backend. If anything
fails, do not launch — fix and re-test.

## 12. ☐ B2C smoke test: register → buy → see in orders

```bash
bash scripts/test_phase3.sh
bash scripts/test_phase4.sh
bash scripts/test_phase6.sh
```

Every assertion must pass against the prod backend.

## 13. ☐ CI green

- [ ] `.github/workflows/ci.yml` runs on every PR
- [ ] Backend pytest passes (72 tests)
- [ ] Coverage >= 35% (CI fails below this; raise the threshold
      as coverage grows)
- [ ] No lint or typecheck errors

## 14. ☐ Runbook exists

- [ ] `docs/troubleshooting.md` covers the top 10 issues
- [ ] On-call rotation assigned
- [ ] PagerDuty / Opsgenie integration with severity tiers
- [ ] Escalation: backend down → CTO; DB issue → SRE; payment
      issue → Finance
