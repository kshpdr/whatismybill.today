# FORM Design System
## whatismybill.today — Bauhaus 2030 · Geometric · Color as Function

**Design philosophy in one sentence:** The Bauhaus principles liberated from the museum — a dark foundation with a precise three-color system (teal / amber / coral), where geometric shapes are the status language, numbers are the dominant visual element, and every color appears because it means something.

---

## 1. File Inventory — What to Touch

| File | What changes |
|---|---|
| `app/globals.css` | All CSS custom property tokens (colors, radius) |
| `app/layout.tsx` | Replace Geist fonts with Unbounded + DM Mono |
| `app/page.tsx` (or component files) | Color constants `C` — map to FORM three-color system |
| Any status/badge component | Replace text/color logic with geometric shape system |

---

## 2. Fonts

### Install via next/font/google in `app/layout.tsx`

Replace the current `Geist` / `Geist_Mono` imports with:

```tsx
import { Unbounded, DM_Mono } from "next/font/google";

const unbounded = Unbounded({
  variable: "--font-sans",      // replaces --font-geist-sans
  subsets: ["latin"],
  weight: ["200", "300", "400", "700", "900"],
});

const dmMono = DM_Mono({
  variable: "--font-mono",      // replaces --font-geist-mono
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});
```

Then in the `<html>` tag:
```tsx
<html className={`${unbounded.variable} ${dmMono.variable} h-full antialiased`}>
```

### Usage rules
| Role | Font | Weight | Notes |
|---|---|---|---|
| Hero numbers / Display | `font-sans` (Unbounded) | 700–900 | Letter-spacing: -0.04em |
| Section headings / Nav | `font-sans` (Unbounded) | 400 | Letter-spacing: 0.08em, uppercase |
| Body text / Bill names | `font-sans` (Unbounded) | 300–400 | Letter-spacing: 0.01em |
| Data / Metadata / Timestamps | `font-mono` (DM Mono) | 300–400 | Letter-spacing: 0.1–0.3em uppercase |
| Status labels | `font-mono` (DM Mono) | 400 | Uppercase, 8–9px |

---

## 3. Color Tokens — Replace in `app/globals.css`

```css
:root {
  --background:           #1C1917;   /* oklch(0.15 0.008 50)  — warm dark base (not black) */
  --foreground:           #FAFAF8;   /* oklch(0.98 0.003 75)  — warm near-white             */

  --card:                 #211E1B;   /* oklch(0.17 0.008 50)  — slightly raised surface      */
  --card-foreground:      #FAFAF8;

  --popover:              #2A2622;   /* oklch(0.20 0.009 50)  */
  --popover-foreground:   #FAFAF8;

  /* Primary = TEAL — used for "paid" / resolved / positive state */
  --primary:              #0D9488;   /* oklch(0.57 0.130 182) — FORM teal                    */
  --primary-foreground:   #FFFFFF;

  /* Secondary = used for surfaces */
  --secondary:            #2A2622;
  --secondary-foreground: #FAFAF8;

  --muted:                #2A2622;
  --muted-foreground:     rgba(250,250,248,0.35);

  /* Accent = AMBER — used for "due soon" / attention / pending */
  --accent:               rgba(245,158,11,0.12);
  --accent-foreground:    #F59E0B;   /* oklch(0.73 0.170 70)  — FORM amber                   */

  --destructive:          #F97316;   /* oklch(0.68 0.185 45)  — FORM coral (overdue/error)    */

  --border:               rgba(255,255,255,0.06);
  --input:                rgba(255,255,255,0.08);
  --ring:                 #0D9488;

  /* Chart / data colors — the three-color system */
  --chart-1:              #0D9488;   /* teal  — paid / positive                              */
  --chart-2:              #F59E0B;   /* amber — pending / neutral                            */
  --chart-3:              #F97316;   /* coral — overdue / negative                           */
  --chart-4:              rgba(250,250,248,0.3);  /* ghost bars                              */
  --chart-5:              rgba(250,250,248,0.12); /* very faint                              */

  --radius:               0px;       /* FORM has no border radius — all square geometry      */

  /* Sidebar */
  --sidebar:              #1C1917;
  --sidebar-foreground:   #FAFAF8;
  --sidebar-primary:      #0D9488;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent:       rgba(13,148,136,0.12);
  --sidebar-accent-foreground: #0D9488;
  --sidebar-border:       rgba(255,255,255,0.06);
  --sidebar-ring:         #0D9488;
}

.dark {
  /* Same as :root — FORM is always dark */
}
```

---

## 4. The Three-Color Status System

This is the core of FORM. Every UI element that communicates status uses EXACTLY one of these three colors, paired with its geometric shape:

| Status | Color | Hex | Shape | Shape as CSS |
|---|---|---|---|---|
| Paid / Resolved | **Teal** | `#0D9488` | ■ Square | `width:6px;height:6px;background:#0D9488` |
| Due / Pending | **Amber** | `#F59E0B` | ● Circle | `width:6px;height:6px;border-radius:50%;background:#F59E0B` |
| Overdue / Critical | **Coral** | `#F97316` | ▲ Triangle | CSS triangle via border trick — see below |

### Triangle shape (overdue indicator)
```css
.shape-triangle-overdue {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-bottom: 7px solid #F97316;
  animation: flicker 2s ease-in-out infinite alternate;
}

@keyframes flicker {
  from { opacity: 1; }
  to   { opacity: 0.4; }
}
```

### Status badge pattern
```tsx
// Paid
<div className="flex items-center gap-1.5">
  <div style={{width:6,height:6,background:'#0D9488'}} />
  <span className="font-mono text-[8px] tracking-wider uppercase text-teal-500">Paid</span>
</div>

// Due
<div className="flex items-center gap-1.5">
  <div style={{width:6,height:6,borderRadius:'50%',background:'#F59E0B'}} />
  <span className="font-mono text-[8px] tracking-wider uppercase text-amber-500">Due</span>
</div>

// Overdue (triangle + flicker animation)
<div className="flex items-center gap-1.5">
  <div className="shape-triangle-overdue" />
  <span className="font-mono text-[8px] tracking-wider uppercase text-orange-500">Overdue</span>
</div>
```

---

## 5. Typography Scale

```css
@layer base {
  /* Display — hero numbers */
  .text-display {
    font-family: var(--font-sans);
    font-size: clamp(56px, 8vw, 108px);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 0.85;
  }

  /* Section label — eyebrow above a section */
  .text-eyebrow {
    font-family: var(--font-mono);
    font-size: 8px;
    font-weight: 400;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }

  /* Nav items */
  .text-nav {
    font-family: var(--font-sans);
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* Bill name */
  .text-bill-name {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 400;
  }

  /* Bill amount */
  .text-bill-amount {
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
  }
}
```

---

## 6. Component Patterns

### Header / Navigation
```css
.header {
  background: var(--background);
  border-bottom: 1px solid var(--border);
  height: 56px;
  padding: 0 36px;
  display: flex;
  align-items: center;
  gap: 0;
}

/* Logo: the three shapes + wordmark */
/* Render: ■ (teal) ● (amber) ▲ (coral) + "whatismybill" in Unbounded 700 11px */

.nav-item {
  font-family: var(--font-sans);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  padding: 0 16px;
  height: 56px;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--border);
  transition: color 0.2s;
}

.nav-item.active { color: var(--foreground); }
.nav-item:hover  { color: rgba(250,250,248,0.7); }
```

### Hero — Color-Block Grid
FORM's hero is a 4-column grid where each column is a solid color block:

```tsx
// Column 1: dark background — main total (2fr)
// Column 2: amber background — due this week
// Column 3: teal background  — paid
// Column 4: coral background  — overdue
```

```css
.hero-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  border-bottom: 1px solid var(--border);
}

.hero-cell {
  padding: 32px;
  border-right: 1px solid var(--border);
  position: relative;
  overflow: hidden;
}

/* The geometric shape watermark in each cell corner */
.hero-cell::after {
  content: '';
  position: absolute;
  bottom: -20px; right: -20px;
  width: 100px; height: 100px;
  border-radius: 50%; /* circle for the amber cell, none for others */
  background: currentColor;
  opacity: 0.08;
  pointer-events: none;
}

/* Cell color overrides */
.hero-cell-amber { background: #F59E0B; }
.hero-cell-amber .hero-cell-label { color: rgba(0,0,0,0.45); }
.hero-cell-amber .hero-cell-number { color: #1C1917; }

.hero-cell-teal { background: #0D9488; }
.hero-cell-teal .hero-cell-label { color: rgba(255,255,255,0.55); }
.hero-cell-teal .hero-cell-number { color: #ffffff; }

.hero-cell-coral { background: #F97316; }
.hero-cell-coral .hero-cell-label { color: rgba(255,255,255,0.55); }
.hero-cell-coral .hero-cell-number { color: #ffffff; }

.hero-cell-label {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin-bottom: 12px;
}

.hero-cell-number {
  font-family: var(--font-sans);
  font-size: clamp(40px, 5vw, 64px);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 0.85;
  color: var(--foreground);
}

.hero-cell-delta {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--muted-foreground);
  margin-top: 14px;
}
```

### Bill Table
```css
.bill-table-row {
  display: grid;
  grid-template-columns: 28px 1fr 80px 80px 100px 80px;
  /* #  | Name | Category | Due | Amount | Status */
  padding: 13px 32px;
  border-bottom: 1px solid var(--border);
  align-items: center;
}

.bill-row-index {
  font-family: var(--font-mono);
  font-size: 9px;
  color: rgba(250,250,248,0.12);
}

.bill-row-name {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 400;
  color: var(--foreground);
}

.bill-row-cat {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin-top: 2px;
}

.bill-row-amount {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  color: var(--foreground);
}
```

### Bar Chart (recharts)
```tsx
// In C object (page.tsx or shared constants):
const C = {
  electricity: "#0D9488",   // teal (paid/positive)
  gas:         "#F59E0B",   // amber (pending/neutral)
  water:       "#F97316",   // coral (overdue/negative)
  delivery:    "rgba(250,250,248,0.3)",
  programs:    "rgba(250,250,248,0.2)",
  taxes:       "rgba(250,250,248,0.12)",
  // Current month bar in charts: use amber #F59E0B
  // Prior months: rgba(255,255,255,0.12)
};

// CartesianGrid: stroke="rgba(255,255,255,0.04)" strokeDasharray=""
// Axes: fill="rgba(250,250,248,0.25)", fontSize=8, fontFamily="var(--font-mono)"
// No border radius on bars (radius={0})
```

---

## 7. Sidebar / Right Panel

```css
.right-panel {
  border-left: 1px solid var(--border);
  background: var(--background);
  width: 300px;
  display: flex;
  flex-direction: column;
}

.panel-section {
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

.panel-section-label {
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin-bottom: 12px;
}

/* Category breakdown rows */
.cat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

/* The shape indicator for each category */
/* Use square for teal, circle for amber, triangle for coral */
.cat-row-bar {
  flex: 1;
  height: 2px;
  background: rgba(255,255,255,0.06);
  position: relative;
  overflow: hidden;
}

.cat-row-fill {
  position: absolute;
  top: 0; left: 0; bottom: 0;
}
```

---

## 8. Spacing System

| Context | Value |
|---|---|
| Page horizontal padding | `32px` |
| Hero cell padding | `32px` |
| Table row vertical | `13px` (top+bottom) |
| Panel block padding | `20px` |
| Nav height | `56px` |
| Hero cell min-height | implicit (auto) |

---

## 9. Borders & Elevation

FORM has **zero elevation** — no shadows, no blur.

```
Separation is achieved through:
1. 1px borders: rgba(255,255,255,0.06) — used everywhere
2. Color fill: colored hero cells are the only elevation
3. Section dividers: same border rule
```

---

## 10. Alert Indicator (Overdue)

The overdue alert in the nav header:

```tsx
<div style={{
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#F97316',
  padding: '5px 12px',
  background: 'rgba(249,115,22,0.10)',
  border: '1px solid rgba(249,115,22,0.20)',
}}>
  <div className="shape-triangle-overdue" />
  OVERDUE
</div>
```

---

## 11. Animation Principles

```css
/* FORM animations are minimal — only entrance fades */
@keyframes form-enter {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Hero section */
.hero-enter { animation: form-enter 0.4s ease; }

/* Main content */
.main-enter { animation: form-enter 0.5s 0.08s ease both; }

/* Status triangle flicker — only overdue triangle */
@keyframes flicker {
  from { opacity: 1; }
  to   { opacity: 0.4; }
}
```

---

## 12. Quick-Reference Palette

```
Background:        #1C1917   — warm dark (not pure black)
Surface:           #211E1B   — cards / panels
Surface 2:         #2A2622   — hover state
Foreground:        #FAFAF8   — warm off-white
Muted text:        rgba(250,250,248,0.35)
Faint text:        rgba(250,250,248,0.18)
Border:            rgba(255,255,255,0.06)

─── THREE-COLOR SYSTEM ───────────────────────────────
Teal   (#0D9488)   ■ SQUARE    → Paid / Resolved / Positive
Amber  (#F59E0B)   ● CIRCLE    → Due / Pending / Neutral
Coral  (#F97316)   ▲ TRIANGLE  → Overdue / Critical / Negative
──────────────────────────────────────────────────────
```

---

## 13. The Logo Mark

The FORM logo is always three geometric shapes side by side, in this order:

```tsx
// Render exactly this — do not replace with an icon or SVG logo
<div style={{display:'flex', alignItems:'center', gap:5}}>
  <div style={{width:8,height:8,background:'#0D9488'}} />                  {/* ■ teal square */}
  <div style={{width:8,height:8,borderRadius:'50%',background:'#F59E0B'}} /> {/* ● amber circle */}
  <div style={{width:0,height:0,
    borderLeft:'5px solid transparent',
    borderRight:'5px solid transparent',
    borderBottom:'8px solid #F97316'}} />                                   {/* ▲ coral triangle */}
</div>
```

---

## 14. Anti-Patterns (what NOT to do)

- Do NOT use rounded corners (`border-radius: 0` everywhere)
- Do NOT add box-shadows or elevation effects
- Do NOT use color for decorative purposes — every color must indicate status (teal=paid, amber=due, coral=overdue)
- Do NOT introduce a fourth color into the UI
- Do NOT use the teal/amber/coral for anything other than their designated status meaning
- Do NOT use colored backgrounds other than the hero cells
- Do NOT use any font other than Unbounded + DM Mono
- Recharts bars should have `radius={0}` — no rounded bars
- CartesianGrid should be extremely faint or absent
