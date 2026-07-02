---
name: tailwind-design-system
description: Use when styling any component or page in the ModestWear frontend. Triggers on Tailwind classes, color choices, typography, spacing, button/card/badge patterns, or any visual design concern in frontend/app or frontend/components.
---

# Tailwind Design System Skill

## Overview
ModestWear's design system is **implicit**, scattered across `Header.tsx`, `Footer.tsx`, `ProductCard.tsx`, `admin/page.tsx`, and `globals.css`. This skill makes it explicit and enforceable. Tailwind CSS v4 is used (note `@import "tailwindcss"` in `globals.css`, not v3 directives).

## When to use this skill
- Adding a new component or page
- Choosing colors, fonts, spacing, or border-radius
- Reviewing a PR for visual consistency
- Resolving "what shade of stone should I use" questions

## Color palette (canonical)

The project uses **warm neutrals** (stone) with a **single rose accent**. No other palette is allowed unless explicitly approved.

### Brand neutrals: `stone-*`
- Page background: `bg-stone-50` (warm off-white)
- Card / surface: `bg-white`
- Borders: `border-stone-200`
- Subtle hover: `hover:bg-stone-50` or `hover:bg-stone-100`
- Body text: `text-stone-600` or `text-stone-700`
- Headings: `text-stone-800`
- Muted text: `text-stone-500`
- Footer / disabled: `text-stone-400`

### Accent: `rose-*` (use sparingly)
- Primary CTA: `bg-rose-500 hover:bg-rose-600` (rare — most CTAs are stone)
- Brand mark, sale badge, cart count badge: `bg-rose-500`
- Link accent: `text-rose-500 hover:text-rose-600` (e.g., "View all" links in admin)

### Status colors (admin only)
| State | Background | Text |
|---|---|---|
| Delivered / success | `bg-green-100` | `text-green-700` |
| Shipped / info | `bg-blue-100` | `text-blue-700` |
| Paid / brand | `bg-rose-100` | `text-rose-700` |
| Pending / warning | `bg-amber-100` | `text-amber-700` |
| Cancelled / error | `bg-red-100` | `text-red-700` |
| Default | `bg-stone-100` | `text-stone-700` |

The stat-card backgrounds in `admin/page.tsx` (`bg-rose-50`, `bg-blue-50`, `bg-green-50`, `bg-amber-50`) follow this same family. **Stay in -50 / -100 for tints, never -500+ as a card background.**

### Forbidden palettes
Never use: `indigo-*`, `purple-*`, `pink-*` (different from rose), `cyan-*`, `teal-*`, `lime-*`, `fuchsia-*`. If you need a non-status color, default to stone. If you need an alert, use the status table above.

## Typography

Two fonts, set up in `globals.css`:
- **Playfair Display** (`--font-playfair`) — used via `font-serif` class for headings
- **Inter** (`--font-inter`) — body, sans-serif

### Hierarchy

| Level | Classes | Use case |
|---|---|---|
| H1 (page title) | `text-3xl font-serif text-stone-800` | Page hero, "Admin Dashboard", "Shop" |
| H2 (section) | `text-lg font-serif text-stone-800` or `text-2xl font-serif` | Card titles, section headers |
| H3 (subsection) | `text-base font-medium text-stone-800` | List section titles |
| Body | `text-sm text-stone-600` or `text-base text-stone-700` | Default |
| Muted / meta | `text-xs text-stone-500` or `text-stone-400` | Dates, hints |
| Numeric / count | `text-3xl font-serif text-stone-800` | Stat values in admin |

**Never use `font-bold` on serif headings** — Playfair is already weighty. Use `font-medium` or `font-semibold` for emphasis on sans-serif body.

## Spacing

- Page container: `max-w-7xl mx-auto px-4 py-8`
- Section spacing: `mb-8` or `mb-6` between major blocks
- Card padding: `p-6` (default), `p-4` (compact lists)
- Vertical rhythm inside cards: `space-y-2` (tight) or `space-y-4` (loose)
- Grid gaps: `gap-6` (cards), `gap-4` (form fields), `gap-3` (button rows)

## Borders & corners

- Card: `rounded-xl border border-stone-200 bg-white`
- Inner card / panel: `rounded-lg border border-stone-100` or no border, just `bg-stone-50`
- Inputs: `rounded-lg border border-stone-300 focus:border-rose-500 focus:ring-1 focus:ring-rose-500`
- Pills / badges: `rounded-full` with `px-2 py-1` or `px-3 py-1`
- Buttons: `rounded-lg`

**Default corner radius is `rounded-lg` or `rounded-xl`. Never `rounded-md` (too sharp) or `rounded-2xl` (too soft) for primary surfaces.**

## Button patterns

### Primary action
```tsx
<button className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700">
  + Add Product
</button>
```

### Secondary action
```tsx
<button className="border border-stone-300 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-50">
  Cancel
</button>
```

### Accent (rare, e.g., "Proceed to Checkout")
```tsx
<button className="bg-rose-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-rose-600">
  Checkout
</button>
```

### Ghost / link-style
```tsx
<Link className="text-rose-500 hover:text-rose-600 text-sm hover:underline">
  View all
</Link>
```

## Card patterns

### Stat card (admin)
```tsx
<div className="bg-rose-50 rounded-xl p-6">
  <p className="text-3xl font-serif text-stone-800 mb-1">{value}</p>
  <p className="text-sm text-stone-500">{label}</p>
</div>
```

### List / table card
```tsx
<div className="bg-white rounded-xl border border-stone-200 p-6">
  <h2 className="font-serif text-lg text-stone-800 mb-4">Title</h2>
  <div className="space-y-2">
    {items.map(...)}
  </div>
</div>
```

### Quick action card (admin)
```tsx
<Link className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100">
  Manage Products
  <span>→</span>
</Link>
```

## Status badge pattern
```tsx
const statusColor = (status: string) => {
  switch (status) {
    case 'delivered': return 'bg-green-100 text-green-700';
    case 'shipped':   return 'bg-blue-100 text-blue-700';
    case 'paid':      return 'bg-rose-100 text-rose-700';
    case 'pending':   return 'bg-amber-100 text-amber-700';
    case 'cancelled': return 'bg-red-100 text-red-700';
    default:          return 'bg-stone-100 text-stone-700';
  }
};

<span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(status)}`}>
  {status}
</span>
```

This pattern is already in `admin/page.tsx:24-33`. **Reuse it everywhere — don't reinvent.**

## Iconography

Heroicons (outline) via inline SVG with `stroke="currentColor"`. The cart and user icons in `Header.tsx:21-26` are the reference. Always `className="w-6 h-6 text-stone-700"` for nav icons.

## Modest-fashion-specific rules

1. **No revealing imagery in placeholders.** Product images use `aspect-[4/5]` portrait ratio (clothing, not landscapes).
2. **Generous whitespace.** Modest aesthetic favors breathing room — favor `py-8` and `py-12` for hero sections, `gap-8` not `gap-4`.
3. **Soft, warm, never neon.** Stick to stone + rose. If a marketing campaign needs a seasonal color (e.g., Ramadan green), restrict it to a banner component only and revert for the rest of the page.
4. **Typography-led, not image-led.** Playfair headings are a brand asset. Use them prominently on hero sections.

## Things to never do

- Never import a UI component library (shadcn, MUI, Chakra) without an explicit decision. This project is hand-Tailwind.
- Never use `text-white` text on a non-`stone-800` or non-`rose-*` background. Contrast ratios matter.
- Never use `bg-black`. The brand is warm, not stark. Use `stone-900` if you need near-black.
- Never use shadow utilities (`shadow-lg`, etc.) on cards. Borders are the depth signal. `shadow-sm` is the maximum.
- Never use `font-bold` on `font-serif` elements.
- Never use `rounded-md` (too sharp) or `rounded-3xl` / `rounded-full` on rectangular cards.
- Never animate with `transition-all` — be specific: `transition-colors` or `transition-opacity`.
