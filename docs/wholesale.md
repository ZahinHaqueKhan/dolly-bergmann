# Wholesale buyer guide (B2B portal)

ModestWear's wholesale program lets boutiques, retailers, and
other businesses place bulk orders. This guide covers the
end-to-end flow from application to delivery.

## How to apply

1. Visit `/wholesale/signup`.
2. Fill in your contact details and the business profile: company
   name, country, tax ID (optional), phone, website, notes.
3. Click **Submit application**. Your account is created immediately
   and you land on `/wholesale/pending`.
4. We review applications within one business day. You'll get an
   email when you're approved, rejected, or if we need more info.

## Browsing the catalog

Once approved, `/wholesale` is the catalog. We do **not** show
prices — every product is a quote-on-request. Use the
**Add to quote** button on any product:

1. Choose a variant (size + color).
2. Set the quantity. The minimum order quantity (MOQ) is enforced
   per variant. (For example, a dress with MOQ=6 means you need at
   least 6 of that size+color per quote.)
3. The item is added to your local draft. Repeat for more items.

## Building a quote request

Two paths converge to the same submission:

### Cart-style

Click products across the site, add to quote. On
`/wholesale/quote/new`, your cart appears on the left. Adjust
quantities, remove items, then add notes for the team.

### CSV

If you already have a spreadsheet, paste it on the right side of
`/wholesale/quote/new`. One line per item, format `SKU,quantity`.
For example:

```
sku,quantity
MW-DRESS-001-M,50
MW-DRESS-001-L,30
```

Click **Submit quote request**. Status moves to `submitted`.

## Reviewing the priced quote

When we send the quote back, you'll get an email with the PDF and
your quote will appear at `/wholesale/quotes/<id>` with status
`sent`. The page shows:

- Per-line unit prices we set
- Shipping cost, tax, total
- Valid-until date (default: 30 days)
- Any notes from the team

**Accept** creates a wholesale order. **Decline** marks the quote
`declined`. Both actions are final.

## Payment

ModestWear does **not** process B2B payments online. We use offline
terms:

- **Default:** Net-30 from invoice date
- **Methods:** Wire transfer or check
- **Currency:** USD. International wire fees are the buyer's
  responsibility.

When your wire or check clears, we mark the order paid and email
you. Status moves from `awaiting_payment` → `paid`.

## Shipping

We'll ship your order within 7–14 business days from payment
confirmation. The wholesale team adds a tracking number on the
order detail page (`/wholesale/orders/<id>`) as soon as the carrier
scans the package. Risk of loss passes to the buyer when the
package is scanned.

## Lead times and custom orders

- **Stock items:** 7–14 business days from payment.
- **Custom orders** (private-label, special colors, custom
  embroidery): 4–8 weeks. Custom orders require a 30–50% deposit
  before production starts. Contact the wholesale team to discuss
  scope.

## Chatbot help

The chatbot at the bottom-right of every page knows the B2B FAQ.
Ask it about MOQ, payment terms, lead times, shipping, or how to
build a quote. For anything it can't answer, it'll point you to
`support@modestwear.com`.

## Common questions

**Q: I missed the MOQ. Can you make an exception?**
A: Email `support@modestwear.com` with the SKU and quantity. We
sometimes accept sub-MOQ orders at a per-unit surcharge.

**Q: Can I change a quote after it's been sent?**
A: Not directly. Reply to the quote email or contact
`support@modestwear.com` and we'll send a revised version.

**Q: My order is on a wire transfer. When does the clock start?**
A: We use the date the wire is received. For checks, the date the
check clears our bank.
