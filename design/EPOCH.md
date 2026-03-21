# EPOCH Design System
## whatismybill.today — Post-Minimalism · Texture as Luxury

**Design philosophy in one sentence:** As AI generates infinite smooth perfection, the deliberate rough edge — grain, weight, materiality — becomes the mark of a human hand. One accent color, used precisely. Typography carries the entire design. The background has grain.

---

## 1. File Inventory — What to Touch

| File | What changes |
|---|---|
| `app/globals.css` | All CSS custom property tokens (colors, radius, typography) + grain texture |
| `app/layout.tsx` | Replace Geist font imports with Syne + DM Mono |
| `app/page.tsx` (or any component files) | Color constants `C` — replace chart/status colors |
| Any component that imports a `cn` / Tailwind class | Follow token names below — they map 1:1 to existing variable names |

---

## 2. Fonts

### Install via next/font/google in `app/layout.tsx`

Replace the current `Geist` / `Geist_Mono` imports with:

```tsx
import { Syne, DM_Mono } from "next/font/google";

const syneFont = Syne({
  variable: "--font-sans",      // replaces --font-geist-sans
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-mono",      // replaces --font-geist-mono
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});
```

Then in the `<html>` tag:
```tsx
<html className={`${syneFont.variable} ${dmMono.variable} h-full antialiased`}>
```

### Usage rules
| Role | Font | Weight | Notes |
|---|---|---|---|
| Hero numbers / Display | `font-sans` (Syne) | 800 | Letter-spacing: -0.05em |
| Headings / Nav | `font-sans` (Syne) | 600–700 | Letter-spacing: -0.02em |
| Body / Labels | `font-sans` (Syne) | 400–500 | Letter-spacing: 0 |
| Data / Metadata / Timestamps | `font-mono` (DM Mono) | 300–400 | Letter-spacing: 0.1–0.3em uppercase |
| Status badges | `font-mono` (DM Mono) | 400 | Uppercase, letter-spacing: 0.12em |

---

## 3. Color Tokens — Replace in `app/globals.css`

The entire `:root` and `.dark` block should become:

```css
:root {
  /* EPOCH is dark-only. These are the same for both light and dark. */
  --background:           #141210;   /* oklch(0.13 0.008 50)  — warm charcoal-black  */
  --foreground:           #EDE8E0;   /* oklch(0.93 0.010 75)  — warm cream            */

  --card:                 #1A1814;   /* oklch(0.16 0.008 50)  — slightly lighter bg    */
  --card-foreground:      #EDE8E0;

  --popover:              #211F1A;   /* oklch(0.19 0.008 50)  */
  --popover-foreground:   #EDE8E0;

  /* Primary = the single ochre accent */
  --primary:              #C4882A;   /* oklch(0.62 0.130 70)  — warm ochre/amber       */
  --primary-foreground:   #141210;

  --secondary:            #211F1A;   /* surface 2                                       */
  --secondary-foreground: #EDE8E0;

  --muted:                #211F1A;   /* surface for de-emphasized areas                 */
  --muted-foreground:     rgba(237,232,224,0.35);

  --accent:               rgba(196,136,42,0.10);  /* ochre at 10% — hover/highlight    */
  --accent-foreground:    #C4882A;

  --destructive:          #C0392B;   /* red — used only for critical errors             */

  --border:               rgba(255,255,255,0.06);
  --input:                rgba(255,255,255,0.08);
  --ring:                 #C4882A;

  /* Chart / data colors — used in recharts C object */
  --chart-1:              #C4882A;   /* ochre (primary accent)  */
  --chart-2:              #4ABFA8;   /* muted teal (secondary)  */
  --chart-3:              rgba(237,232,224,0.5); /* ghost / neutral */
  --chart-4:              rgba(237,232,224,0.25);
  --chart-5:              rgba(237,232,224,0.12);

  --radius:               0px;       /* EPOCH has no border radius. Everything is square. */

  /* Sidebar */
  --sidebar:              #1A1814;
  --sidebar-foreground:   #EDE8E0;
  --sidebar-primary:      #C4882A;
  --sidebar-primary-foreground: #141210;
  --sidebar-accent:       rgba(196,136,42,0.10);
  --sidebar-accent-foreground: #C4882A;
  --sidebar-border:       rgba(255,255,255,0.06);
  --sidebar-ring:         #C4882A;
}

/* No separate .dark block — EPOCH is always dark */
.dark {
  /* Inherit everything from :root — no changes needed */
}
```

---

## 4. Grain Texture — Add to `app/globals.css`

Add this after the `:root` block. This is the defining EPOCH element — do not skip it:

```css
/* ── EPOCH Grain Texture ─────────────────────────────────────── */
html::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.028;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 128px;
}
```

---

## 5. Typography Scale

```css
/* Add to globals.css @layer base */
@layer base {
  /* Display — hero numbers, main figures */
  .text-display {
    font-family: var(--font-sans);
    font-size: clamp(80px, 12vw, 160px);
    font-weight: 800;
    letter-spacing: -0.05em;
    line-height: 0.82;
    color: var(--foreground);
  }

  /* Heading 1 — section titles */
  .text-h1 {
    font-family: var(--font-sans);
    font-size: clamp(28px, 4vw, 48px);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 0.9;
  }

  /* Heading 2 — card headers */
  .text-h2 {
    font-family: var(--font-sans);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  /* Label — metadata, table headers */
  .text-label {
    font-family: var(--font-mono);
    font-size: 8px;
    font-weight: 400;
    letter-spacing: 0.28em;
    text-transform: uppercase;
  }

  /* Amount — bill amounts in table */
  .text-amount {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  /* Mono data — dates, IDs, timestamps */
  .text-mono {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
  }
}
```

---

## 6. Component Patterns

### Navigation / Masthead
```css
/* Flat, typographic. No logo graphics. Just the name in 600 weight. */
nav {
  background: var(--background);
  border-bottom: 1px solid var(--border);
  height: 52px;
  padding: 0 48px;
  display: flex;
  align-items: center;
  gap: 32px;
}

.nav-brand {
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.nav-link {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.nav-link.active {
  color: var(--foreground);
}
```

### Hero Section — the number owns the space
```css
.hero {
  padding: 56px 48px 48px;
  border-bottom: 1px solid var(--border);
  position: relative;
  overflow: hidden;
}

/* Subtle ochre radial glow behind hero */
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 70% 50%, rgba(196,136,42,0.06) 0%, transparent 60%);
  pointer-events: none;
}

.hero-label {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--primary);       /* ochre — this is the ONLY colored text above the number */
  margin-bottom: 16px;
}

.hero-figure {
  font-size: clamp(80px, 14vw, 160px);
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--foreground);
  line-height: 0.82;
}
```

### Stat Row — below the hero
```css
/* Inline stats: OVERDUE $89.99 · DUE $234.99 · SETTLED $336.46 */
.stat-row {
  display: flex;
  gap: 40px;
  margin-top: 24px;
}

.stat-item-label {
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin-bottom: 3px;
}

.stat-item-value {
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.03em;
}

/* Overdue is the only stat that gets the accent color */
.stat-item-value.critical { color: var(--primary); }
```

### Table / Bill List
```css
/* Full-bleed table, no card wrapper, no shadow */
.bill-table {
  width: 100%;
  border-top: 1px solid var(--border);
}

.bill-table-header {
  display: grid;
  grid-template-columns: 1fr 80px 100px 80px;
  padding: 10px 48px;
  background: rgba(255,255,255,0.015);
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.bill-table-col-label {
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.bill-table-row {
  display: grid;
  grid-template-columns: 1fr 80px 100px 80px;
  padding: 14px 48px;
  border-bottom: 1px solid var(--border);
  transition: background 0.2s;
}

.bill-table-row:hover { background: rgba(255,255,255,0.02); }

/* Highlight the overdue row with the accent border */
.bill-table-row.overdue {
  background: rgba(196,136,42,0.06);
  border-left: 2px solid var(--primary);
  padding-left: 46px; /* compensate for border */
}

.bill-name { font-size: 13px; font-weight: 500; }
.bill-category {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin-top: 2px;
}
.bill-amount { font-size: 13px; font-weight: 600; text-align: right; }
```

### Status Marks — typographic, not colored
```css
/* EPOCH uses text marks, not pills or colored badges */
/* Status is conveyed through monospaced uppercase text */
/* ONLY overdue gets the accent color */

.status-mark {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}

.status-mark.overdue { color: var(--primary); }   /* ochre */
.status-mark.paid    { color: rgba(74,191,168,0.5); } /* muted teal */
.status-mark.pending { color: var(--muted-foreground); } /* just muted */
```

### Right Panel / Sidebar
```css
.side-panel {
  background: var(--background); /* same as bg — no elevation */
  border-left: 1px solid var(--border);
}

.panel-block {
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

.panel-block-label {
  font-family: var(--font-mono);
  font-size: 7px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin-bottom: 14px;
}
```

### Bar Chart (recharts)
```css
/* In the C object in page.tsx or wherever chart colors are defined: */
/*
const C = {
  electricity: "#C4882A",    // ochre (primary)
  gas:         "#4ABFA8",    // muted teal
  water:       "rgba(237,232,224,0.5)",
  delivery:    "rgba(237,232,224,0.3)",
  programs:    "rgba(237,232,224,0.2)",
  taxes:       "rgba(237,232,224,0.15)",
};
*/

/* Bar style: no radius, 100% height of cell, very simple */
/* Use CartesianGrid with stroke="rgba(255,255,255,0.04)" strokeDasharray="none" */
/* Axis labels: font-family DM Mono, fontSize 8, fill muted */
```

---

## 7. Spacing System

| Token | Value | Use |
|---|---|---|
| `--space-page-x` | `48px` | Page horizontal padding |
| `--space-page-y` | `56px` | Hero/section top padding |
| `--space-block` | `20px` | Panel block padding |
| `--space-row` | `14px` | Table row vertical padding |
| `--space-label` | `8–10px` | Space below a section label |

---

## 8. Borders & Elevation

EPOCH has **zero elevation**. No box-shadows. No blur-elevated cards.

```
Every surface is flat.
Separation is achieved only through:
1. 1px border lines: rgba(255,255,255,0.06)
2. Subtle background tint shifts: rgba(255,255,255,0.01–0.02)
3. The overdue row: 2px left border in ochre + 6% ochre bg tint
```

---

## 9. Animation Principles

```css
/* EPOCH moves slowly and with purpose */
/* Fade in only — no slides, no bounces */

@keyframes epoch-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.page-enter { animation: epoch-enter 0.5s ease; }

/* Hover transitions: always 0.2s, background only */
/* No transform on hover — nothing moves */
```

---

## 10. The Statement

Add this component at the bottom of each major page section. It is the signature of EPOCH:

```tsx
<div className="statement">
  {/* 11px italic, muted, max-width 680px */}
  {/* Content varies by context */}
  In 2030, the premium signal is not smoothness — it is weight.
  The grain on the background is not an error; it is the mark of intention.
</div>
```

---

## 11. Quick-Reference Palette

```
Background:      #141210   — warm charcoal, not pure black
Surface:         #1A1814   — card / panel surface
Surface 2:       #211F1A   — hover / active surface
Foreground:      #EDE8E0   — warm cream, not pure white
Muted text:      rgba(237,232,224,0.35)
Faint text:      rgba(237,232,224,0.18)
Border:          rgba(255,255,255,0.06)
Accent (ochre):  #C4882A   — used ONCE per screen ideally
Accent dim:      rgba(196,136,42,0.10)
Teal (data 2):   #4ABFA8   — for settled/positive data only
Red (critical):  #C0392B   — error states only
```

---

## 12. Anti-Patterns (what NOT to do)

- Do NOT use rounded corners anywhere (`border-radius: 0` everywhere)
- Do NOT add box-shadows or drop-shadows
- Do NOT use more than one accent color on screen at once
- Do NOT use colored status badges — use `.status-mark` text only
- Do NOT import any font other than Syne + DM Mono
- Do NOT animate anything with `transform: translateY` or scale — fade only
- Do NOT add gradients to cards or buttons — flat surfaces only
- The grain is generated via SVG filter. Do NOT replace it with an image file.
