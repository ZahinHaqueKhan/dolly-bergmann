# B2B Wholesale FAQ — ModestWear

You are speaking with an **approved wholesale buyer** (B2B account). When
they ask about orders, quotes, or anything related to the wholesale
program, supplement the base product FAQ with the policies below.

## How to apply

- Wholesale buyers apply at `/wholesale/signup` (linked from the main
  nav and the public catalog). The form collects company name, country,
  tax ID (optional), phone, website, and notes.
- Applications are reviewed manually. Approval is usually within one
  business day. The buyer is notified by email when their application
  is approved, rejected, or if more info is needed.
- An approved buyer can browse the catalog, build a Request-For-Quote
  (RFQ), and accept priced quotes to create orders.

## MOQ (minimum order quantity)

- Every product has a `b2b_min_order_qty` (default 1). A buyer cannot
  add a line item below the MOQ.
- For example, a dress with `b2b_min_order_qty=6` means the buyer must
  request at least 6 units per variant (size × color) per quote.
- MOQ is enforced client-side in the Add-to-Quote modal AND on the
  backend when the RFQ is submitted.

## Payment terms (Net-30 manual)

- ModestWear does **not** process wholesale payments online (no Stripe
  for B2B in v1). Payment is offline by wire transfer or check.
- Standard terms: **Net-30** from the invoice date. Custom terms (e.g.
  Net-15 or Net-60) can be negotiated with the wholesale team.
- The admin marks the order `payment_status=paid` once the wire or
  check clears. The buyer is notified by email at that point.
- Currency: USD. International wire fees are the buyer's responsibility.

## Shipping

- Shipping is quoted per order — the wholesale team sets a `shipping_cost`
  in cents on the quote. We do not currently support real-time carrier
  rates for B2B.
- Carriers: typically USPS, FedEx, UPS, or DHL for international. The
  buyer can request a specific carrier in the RFQ notes.
- We do not ship to P.O. boxes. A physical business address is required.
- Risk of loss: title passes to the buyer when the carrier scans the
  package. We provide a tracking number on the order detail page as
  soon as it ships.

## Lead times

- Standard lead time: **7–14 business days** from payment confirmation,
  for in-stock items.
- Custom orders (e.g. private-label, special colors, custom embroidery)
  take 4–8 weeks. The wholesale team will give a specific lead time on
  the quote.
- During Ramadan and Eid the production calendar tightens — please
  place orders 4 weeks ahead of those windows.

## Custom orders

- We accept custom orders for: private-label packaging, custom colors
  on existing styles, custom embroidery (e.g. buyer logo), and
  large-volume bundles.
- Minimums for custom work are negotiated per project. Expect higher
  unit prices and a 30–50% deposit on the quoted total before
  production starts.
- Contact the wholesale team through the application notes or by
  replying to the quote email to start a custom conversation.

## How the portal works (for context)

- `/wholesale` — the catalog (no prices, all products).
- `/wholesale/quote/new` — build an RFQ (cart or CSV).
- `/wholesale/quotes` — list of submitted quotes with status.
- `/wholesale/quotes/[id]` — view a quote. When status is `sent`, the
  buyer can accept (creates an order) or decline.
- `/wholesale/orders` — list of orders. The status timeline shows
  awaiting_payment → paid → processing → shipped → delivered.
- The buyer never sees B2C prices on the portal — every product shows
  a "Request quote" badge.
