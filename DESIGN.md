# DESIGN.md — whatismybill.today Design Philosophy

This document is the canonical reference for all UI decisions. When in doubt, consult this file.

---

## Philosophy

**Less chrome, more data.** The interface should recede. Colors, borders, and motion exist only to communicate information — never for decoration. Every element earns its place.

Inspired by: Cursor, Linear, Vercel, OpenAI — precision tools built for people who notice pixels.

---

## Color Tokens

```
Background layers (dark):
  bg         #0a0a0a    Page background
  surface    #0f0f0f    Sidebar, nav bars
  card       #141414    Cards, panels
  hover      #1a1a1a    Hover state (one stop lighter)

Borders:
  border     rgba(255,255,255,0.07)   Default dividers
  border-hi  rgba(255,255,255,0.12)   Emphasized borders (focus, active)

Text:
  text-1     rgba(255,255,255,0.90)   Primary text
  text-2     rgba(255,255,255,0.55)   Secondary / labels
  text-3     rgba(255,255,255,0.30)   Muted / placeholders

Accent:
  amber      #e8a838    Single brand accent — buttons, links, active states

Utility colors (intentionally desaturated — these are data, not decoration):
  electricity  #d4993a    Amber-gold
  gas          #6892b0    Steel-blue
  water        #47998e    Teal

Delta / status:
  up    #f87171    Red-ish (cost went up — bad)
  down  #4ade80    Green (cost went down — good)
  muted rgba(255,255,255,0.30)   No change
```

---

## Typography

- **Body / UI**: Geist Sans (`var(--font-geist-sans)`) — all non-numeric text
- **Numbers**: Geist Mono (`font-mono`) — every dollar amount, kWh value, percentage, date — no exceptions
- **Sizes**: `text-xs` (11-12px) for labels/meta, `text-sm` (14px) for body, `text-base`(16px) for card values, `text-2xl`+ for hero numbers
- **Labels**: `text-xs font-semibold uppercase tracking-wider` in `text-2` color
- **No bold for emphasis** — use color contrast and size instead

---

## Spacing & Layout

- **Border radius**: `rounded-md` (6px) everywhere — cards, buttons, inputs, badges. No `rounded-xl`, no `rounded-2xl`, no `rounded-full` except spinners.
- **Card padding**: `p-4` (16px) standard, `p-5` for hero sections
- **Gap between cards**: `gap-3` or `space-y-3`
- **Sidebar width**: 208px (desktop)
- **Max content width**: `max-w-4xl` for settings/detail pages

---

## Component Patterns

### Cards
```
bg-[#141414] border border-[rgba(255,255,255,0.07)] rounded-md
```
No shadow. No glow. One flat surface.

### Buttons
- **Primary**: `bg-[#e8a838] hover:bg-[#d4993a] text-black font-semibold text-sm rounded-md px-4 py-2`
- **Secondary**: `border border-[rgba(255,255,255,0.07)] hover:bg-[#1a1a1a] text-[rgba(255,255,255,0.55)] text-sm rounded-md px-4 py-2`
- **Ghost/link**: `text-[rgba(255,255,255,0.55)] hover:text-[rgba(255,255,255,0.90)] text-sm`
- **Destructive**: `text-[#f87171] hover:bg-[rgba(248,113,113,0.08)]`
- No filled colored buttons for anything except the one primary CTA per view

### Inputs
```
bg-[#0f0f0f] border border-[rgba(255,255,255,0.07)] rounded-md px-3 py-2 text-sm
text-[rgba(255,255,255,0.90)] placeholder:text-[rgba(255,255,255,0.30)]
focus:border-[#e8a838] focus:outline-none transition-colors duration-150
```

### Tables
- Header row: `text-xs font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.30)]`
- Row dividers: `border-b border-[rgba(255,255,255,0.04)]`
- Row hover: `hover:bg-[#1a1a1a]`
- Numeric cells: `font-mono tabular-nums`

### Delta badges
- Down (good): `text-[#4ade80] bg-[rgba(74,222,128,0.08)] font-mono text-xs px-1.5 py-0.5 rounded`
- Up (bad): `text-[#f87171] bg-[rgba(248,113,113,0.08)] font-mono text-xs px-1.5 py-0.5 rounded`

### Charts (Recharts)
- Grid: `stroke="rgba(255,255,255,0.04)"` vertical={false}
- Axis labels: `fill="rgba(255,255,255,0.30)"` fontSize={10}
- Axis lines: `axisLine={false}` `tickLine={false}`
- Tooltip bg: `#1a1a1a` border `rgba(255,255,255,0.07)` borderRadius 6
- Bar/line colors: use utility tokens above

### Progress bars
```
h-1 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden
  > div: h-full rounded-full [color from utility token]
```

---

## Motion

- Duration: `150ms`
- Easing: `ease-out`
- Only transition: `background-color`, `color`, `border-color`, `opacity`
- No transforms, no scale, no blur animations in production views (mockup only)

---

## Rules

1. **No white backgrounds** — the entire app is dark. `bg-white` is banned.
2. **No colored background fills** on cards/sections — use border color for utility identity, not fill.
3. **No shadow utilities** (`shadow-*`) — depth is communicated through border contrast alone.
4. **No blur** (`backdrop-blur-*`) — this is flat, not glass.
5. **No gradient utilities** in production — `bg-gradient-*`, `from-*`, `to-*` are banned.
6. **All numbers in `font-mono`** — dollar amounts, percentages, kWh, dates in numeric format.
7. **One accent color** — amber (`#e8a838`) is the only hue used for interactive affordance. Utility colors (gold/blue/teal) are for data only, never for buttons.
8. **Consistent radius** — always `rounded-md`. One exception: `rounded-full` on spinners only.

---

## Auth Pages (login / signup / onboarding)

Split-panel layout is **gone**. Replace with:
- Full dark background `#0a0a0a`
- Centered card `max-w-sm` on `#0f0f0f` (or `#141414`) with `border border-[rgba(255,255,255,0.07)]`
- Brand mark: small amber Zap + monospace wordmark in top-left or above form
- No decorative blobs, gradients, or preview widgets

---

## Share Page

Public read-only page follows the same dark design system. No light theme for public views — consistency matters more than perceived "simplicity for landlords."

---

## File Reference

See `app/mockup/page.tsx` for a working reference implementation of this design system applied to all major screens.
