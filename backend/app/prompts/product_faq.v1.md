# ModestWear Product FAQ — v1

This is the canonical B2C product FAQ for the ModestWear chatbot. It
is loaded into the system prompt for every conversation except where a
specialty addendum (e.g. `wholesale_faq.v1.md`) is appended.

## What we sell

ModestWear is an online modest fashion store. Our catalog includes:

- **Dresses** — casual, work, and occasion modest dresses. Sizes XS–2XL.
- **Khimar** — long, flowing headscarves designed to drape over the
  shoulders. One size, with adjustable ties.
- **Abaya** — full-length robes, both classic and modern cuts.
- **Accessories** — under-scarf caps, pin sets, and slip dresses
  meant to be worn under looser knits.

All garments are designed for everyday modest wear. Fabrics and origin
are listed on each product page.

## Sizing

- Sizes run from **XS to 2XL**.
- Every product page has a size guide. The chatbot can point users to
  the size-guide page at `/size-guide`.
- Khimar is one-size. If a buyer needs a longer khimar, recommend
  searching the catalog for "long khimar" — we carry 2–3 styles at
  any time.

## Care

Most garments are machine-washable on cold, gentle cycle, line dry. A
handful of embellished or silk-blend pieces are dry-clean only — this
is called out on the product page and on the inside label.

## Most-asked questions (FAQ knowledge base, v1 inline)

1. **"What's your return policy?"** — 30 days from delivery, items must
   be unworn with tags. Final-sale items (clearance, intimates) cannot
   be returned. See `/returns` for the full policy and to start a
   return.
2. **"Do you ship internationally?"** — Yes. We ship to most of North
   America, Europe, and parts of Asia. Customs duties are the buyer's
   responsibility. See `/shipping` for the country list and rates.
3. **"How long does shipping take?"** — Standard 5–7 business days
   within the US. Express is 2–3 business days. International varies
   (typically 7–14 business days).
4. **"Is there free shipping?"** — Yes, on US orders over $100.
5. **"Do you have a size guide?"** — Yes, at `/size-guide`.
6. **"Can I modify or cancel my order after placing it?"** — We can
   only modify or cancel orders before fulfillment begins. Contact
   `support@modestwear.com` as soon as possible with your order
   number. The chatbot cannot change orders directly.
7. **"Where is my order?"** — For authenticated users, the system will
   surface a recent-orders summary automatically. The full detail
   lives at `/account/orders`. Tracking numbers are added once the
   carrier scans the package.
8. **"Do you offer wholesale or bulk pricing?"** — Yes. Apply at
   `/wholesale/signup`. Approval is usually within one business day.
9. **"How do I contact customer support?"** — Email
   `support@modestwear.com`. We respond within 24 hours on business
   days.
10. **"Do you have a physical store?"** — ModestWear is online-only.
    We do not currently have a retail location.

## Cross-references

- Store policies (shipping, returns, size guide): see `store_policies.md`.
- Wholesale buyers (B2B): see `wholesale_faq.v1.md` (loaded for
  approved wholesale users).
- Seasonal campaigns: see `seasonal/ramadan.md` and `seasonal/eid.md`.
