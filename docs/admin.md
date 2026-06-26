# Admin user guide

This guide covers the day-to-day work of running a ModestWear store
through the admin panel at `/admin`. Sign in at `/account/login` with
the seeded admin email (`admin@modestwear.test`).

## Dashboard

`/admin` is the at-a-glance view of the store. It shows:

- Total active products
- Total orders (all-time)
- Total revenue from `paid` orders
- Low-stock count (variants with < 5 in stock)
- 5 most recent orders
- Up to 10 low-stock products

## Products

`/admin/products` lists every product, active and inactive. Use the
filters (search, category, status) to narrow the list.

### Create a product

1. Click **+ Add Product** in the top-right.
2. Fill in name, slug, description, category, images, tags, and at
   least one variant (size, color, price, stock).
3. Save. The product goes live immediately on `/shop` and `/product/<slug>`.

### Edit / activate

Click a row to open the edit form. Toggle **Active** to hide/show a
product without deleting it. **B2B only** marks the product as
wholesale-only (it will not appear on the public catalog but will
be visible in the wholesale portal).

### Bulk actions

- **Set active / inactive** for many products at once using the
  checkboxes in the table header.
- **Delete** removes products entirely. Use with care — this is not
  recoverable.

### Image upload

On the product edit form, click **Upload Image** to add a photo. The
backend stores files at `/uploads/products/<id>/<filename>` and
serves them at the same path. The frontend uses `next/image` to
optimise them.

## Orders

`/admin/orders` lists every order with filters for status, date
range, and a free-text search (matches order id or customer email).

Click an order to see:

- Line items with unit prices and subtotals
- Shipping address
- Payment info (Stripe session id, payment intent id)
- Status timeline
- Action panel — change status, issue a refund (full or partial)

A status change is final — use the **Status** dropdown to move an
order from `pending` → `paid` → `shipped` → `delivered`. Refunds
require Stripe to be configured; without a live Stripe key the
endpoint returns 502.

## Coupons

`/admin/coupons` lists every coupon. The forms let you create:

- **Percent** — 0–100% off the order subtotal.
- **Fixed amount** — flat cents off.
- **Free shipping** — 0 cents; the system still records the discount.

The validity window (`starts_at` / `ends_at`) is enforced at
checkout. The optional `usage_limit` caps the total redemptions;
`per_user_limit` caps it per customer.

## Import

`/admin/import` accepts a JSON file matching the schema in
`backend/sample_products.json`. The flow is:

1. **Upload** the file. The backend validates it and creates a job
   in `imported_jobs`. Errors are listed inline.
2. **Review** the diff (would-create, would-update, errors).
3. **Confirm** to execute the import. Slugs that already exist are
   skipped (not overwritten) — re-running the same file is safe.

## Wholesale

`/admin/wholesale/applications` is the B2B approval queue. New
wholesale signups land here. For each application you can:

- **Approve** — sets `User.approved_at = now()` and emails the
  applicant. They can immediately log in and start building RFQs.
- **Reject** — requires a reason; sets status to `rejected` and
  emails the applicant.
- **Request info** — sets status to `info_requested`; the buyer
  sees the reason on their pending page.

`/admin/wholesale/quotes` lists every quote. Click one to:

- Review the buyer's requested line items
- Set a unit price per line
- Add shipping, tax, admin notes, valid-until date
- Click **Send quote** to email the buyer with the PDF/HTML
  document. Status moves to `sent`.

`/admin/wholesale/orders` lists every B2B order. For each:

- **Mark as paid** flips `payment_status=paid` once the wire/check
  arrives and emails the buyer. Status moves from
  `awaiting_payment` to `paid`.
- **Update status** with `shipped` requires a tracking number and
  carrier. The buyer sees the tracking on their order page.
- **Update status** with `delivered` marks the order complete.

## Chatbot logs

`/admin/chatbot` shows logs that need attention: errored (SAIA
unreachable) or refusal-flagged (the bot returned a known refusal
phrase). Click a row to see the full question + response, then
**Resolve** to mark it handled.

## Audit log

`/admin/audit` shows every admin action (approve, reject, send,
mark_paid, etc.) with the actor's id, the affected entity, the IP
and User-Agent, and the request method/path. Filter by action or
entity type to narrow down.

## Settings

`/admin/settings` is the placeholder for SMTP/Resend/Redis
configuration. v1 keeps these in `.env`; the panel only displays
the active values (no write yet — that ships in v1.1).
