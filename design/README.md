# Design System — whatismybill.today

Two production-ready design systems. Pick one and apply it fully.

| System | File | Character | Key font | Accent |
|---|---|---|---|---|
| **EPOCH** | `design/EPOCH.md` | Post-minimalism · Grain · One ochre accent | Syne 800 + DM Mono | `#C4882A` ochre |
| **FORM** | `design/FORM.md` | Bauhaus 2030 · Geometric shapes · Three-color status | Unbounded 700 + DM Mono | Teal `#0D9488` / Amber `#F59E0B` / Coral `#F97316` |

---

## How to Apply a Design System

To switch the entire project to one of these systems, an LLM should execute these steps **in order**:

### Step 1 — Update `app/globals.css`
Copy the full `:root` block from the chosen design doc's **"Color Tokens"** section and replace the existing `:root` block in `app/globals.css`.

Set `--radius: 0px` for both systems (both are zero-radius).

Add the grain texture block (EPOCH only) after the `:root` block.

### Step 2 — Update `app/layout.tsx`
Replace the font imports as specified in the chosen design doc's **"Fonts"** section.
- EPOCH: `Syne` + `DM_Mono`
- FORM: `Unbounded` + `DM_Mono`

Update the `variable` names:
- Primary font → `--font-sans`
- Mono font → `--font-mono`

### Step 3 — Update chart/color constants in `app/page.tsx`
Replace the `C` object with the values from the chosen design doc's **"Bar Chart"** section.

### Step 4 — Update status indicators
Any component that renders a bill status (paid / due / overdue) should be updated to use the pattern from the chosen design doc's **"Status"** section.
- EPOCH: text marks only (`.status-mark`, `.status-mark.overdue`, `.status-mark.paid`)
- FORM: geometric shapes (■ square / ● circle / ▲ triangle) with text

### Step 5 — Update border-radius
Both systems use `border-radius: 0` everywhere. Add to `app/globals.css`:
```css
@layer base {
  * { border-radius: 0 !important; }
}
```

---

## Design Principles Shared by Both Systems

1. **Dark by default** — both systems are dark-first, no light mode needed
2. **Zero elevation** — no box-shadows, no backdrop blur on cards
3. **Flat surfaces** — cards share the background color or have a 1–2% lighter tint
4. **1px border lines** — `rgba(255,255,255,0.06)` for all separators
5. **Monospace for data** — all numbers, dates, metadata, labels use DM Mono
6. **Typography-dominant** — the hero number is the primary visual element on every screen
7. **No border radius** — all UI elements are rectilinear

---

## Key Differences

| | EPOCH | FORM |
|---|---|---|
| Color philosophy | One accent only (ochre) | Three-color semantic system |
| Status language | Typographic marks (`Overdue` in ochre text) | Geometric shapes (■●▲) + colored text |
| Hero treatment | Full-width typographic (160px Syne 800) | 4-column color-block grid |
| Texture | Grain filter on `html::before` | None — clean dark surfaces |
| Personality | Weighty, editorial, intentional | Systematic, geometric, functional |
| Best for | Premium / high-stakes feel | Dashboard / data-dense feel |

---

## File locations of HTML prototypes

Working HTML prototypes (served at `http://localhost:4321/`) live in `design-exploration/`:

| Prototype | URL path |
|---|---|
| EPOCH reference | `/epoch.html` |
| FORM reference | `/baus-plus.html` |
| All designs gallery | `/index.html` |
| MVP Series gallery | `/mvp-series.html` |
| Era Series gallery | `/era-series.html` |
