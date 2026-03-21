# whatismybill.today — Architecture

> **Living document.** Update this whenever a design decision is made or changed.
> Last updated: March 2026

---

## 1. Product Overview

A household utility bill tracker. Users upload PDFs of their electricity, gas, and water bills. The app deterministically parses them into structured data and surfaces spending trends, usage patterns, and charge breakdowns — without AI or manual data entry.

**MVP scope:**
- Email/password auth
- One provider per utility (PG&E electricity + gas, East Bay MUD water)
- Single consistent PDF format per provider
- Manual PDF upload only (no email automation)
- Deterministic regex/rule-based parsing (no LLM)
- Dashboard: hero spend summary, per-utility status, charge breakdown charts

---

## 2. Core Concepts

### Home (Household)
The central organizing unit. Every bill belongs to a home. A home has one **owner** and any number of **members**.

**Nickname** — a human-readable label chosen by the owner (e.g. "The Maple House", "Dad's Place", "Oakland Rental"). This is distinct from the address, which is optional. The nickname is what appears everywhere in the UI. It's personal and informal by design.

**Invite code** — a 6-character alphanumeric code (e.g. `A7K3M2`) generated on home creation. The owner shares this code via any channel (text, WhatsApp, etc.) to invite members. The code doesn't expire by default; the owner can rotate it. This avoids email-based invites for MVP simplicity.

### Owner vs Member

| Capability | Owner | Member |
|---|---|---|
| View bills + dashboard | ✅ | ✅ |
| Upload bills | ✅ | ✅ |
| Invite others (share code) | ✅ | ❌ |
| Rotate invite code | ✅ | ❌ |
| Rename home / update address | ✅ | ❌ |
| Remove members | ✅ | ❌ |
| Delete home | ✅ | ❌ |
| Leave home | ✅ (transfers ownership first) | ✅ |

The role is stored implicitly: if `userId == household.ownerId` → owner, else member.

### Bill Lifecycle

```
Upload PDF  →  Store in Firebase Storage  →  Trigger Cloud Function
    →  Extract text (pdf-parse)  →  Run provider-specific parser
    →  Write structured Bill doc to Firestore  →  Appear in dashboard
```

Parse status transitions: `pending` → `success` | `failed`

If parsing fails, the raw PDF is still stored and the bill appears with a "parse failed" state — the user can see the original PDF but no structured data.

---

## 3. Data Model (Firestore)

### `users/{userId}`

```typescript
{
  id: string              // Firebase Auth UID
  email: string
  name: string
  defaultHouseholdId?: string  // last active household
  createdAt: Timestamp
}
```

### `households/{householdId}`

```typescript
{
  id: string
  nickname: string        // "The Maple House" — required, chosen by owner
  address?: string        // "123 Maple St, Oakland CA 94601" — optional
  ownerId: string         // Firebase Auth UID of the owner
  memberIds: string[]     // all members including owner
  inviteCode: string      // 6-char alphanumeric, e.g. "A7K3M2"
  inviteCodeRotatedAt: Timestamp
  createdAt: Timestamp
}
```

**Index needed:** `inviteCode` (single-field, for join-by-code queries)

### `bills/{billId}`

```typescript
{
  id: string
  householdId: string
  provider: string           // "PG&E", "East Bay MUD"
  utilityType: "electricity" | "gas" | "water"
  billingPeriodStart: Timestamp
  billingPeriodEnd: Timestamp
  totalAmount: number        // USD
  usage: number
  usageUnit: string          // "kWh" | "therms" | "CCF" | "gallons"
  unitPrice: number          // effective blended rate (totalAmount / usage)
  charges: LineCharge[]      // parsed line items
  storageRef: string         // Firebase Storage path
  downloadURL?: string       // cached public URL (set after upload)
  uploadedAt: Timestamp
  uploadedBy: string         // userId
  parseStatus: "pending" | "success" | "failed"
  parseError?: string        // reason if failed
  rawText?: string           // full extracted text (for debugging parsers)
}
```

**Composite indexes needed:**
- `householdId ASC + billingPeriodStart DESC` (main list query)
- `householdId ASC + utilityType ASC + billingPeriodStart DESC` (per-utility query)

### `LineCharge` (embedded in bills)

```typescript
{
  label: string    // "Energy charge", "Delivery charge", "Taxes & fees"
  amount: number   // USD
}
```

---

## 4. Auth & Roles

**Provider:** Firebase Authentication — Email/Password only for MVP.

**Post-registration flow:**
1. User signs up → Firebase Auth user created + Firestore `users/{uid}` doc written
2. **No household created yet** — user is redirected to `/onboarding`
3. Onboarding: user chooses to **create** or **join** a home
4. On create: household doc created, user set as owner, invite code generated
5. On join: user enters 6-char code → Cloud Function validates + adds to `memberIds`
6. User redirected to dashboard

**Session:** Firebase handles session persistence. `onAuthStateChanged` in `AuthContext` maintains the React-side user state.

**Password reset:** `sendPasswordResetEmail` — standard Firebase flow.

---

## 5. Household Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  POST-REGISTRATION                                              │
│                                                                 │
│  Welcome, [Name]!                                               │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │ Create a new home │    │ Join existing home│                  │
│  └──────────────────┘    └──────────────────┘                  │
│          │                        │                             │
│          ▼                        ▼                             │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │ Name your home   │    │ Enter invite code │                  │
│  │ [nickname input] │    │ [6 char boxes]    │                  │
│  │ [address input]  │    │                   │                  │
│  │ [Create →]       │    │ [Join →]          │                  │
│  └──────────────────┘    └──────────────────┘                  │
│          │                        │                             │
│          ▼                        ▼                             │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │ ✓ Home created!  │    │ ✓ Joined!        │                  │
│  │ Invite code:     │    │ Welcome to        │                  │
│  │  A 7 K 3 M 2     │    │ "The Maple House" │                  │
│  │ [Copy] [Share]   │    │                   │                  │
│  │ [Go to dashboard]│    │ [Go to dashboard] │                  │
│  └──────────────────┘    └──────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

**Invite code format:**
- 6 characters: uppercase A–Z (excluding I and O) + digits 2–9
- ~34^6 = ~1.5 billion combinations → negligible collision risk
- Stored in plaintext on the household doc (not a secret — it's a convenience, not a security boundary)
- The security boundary is Firestore rules + Cloud Function: a user can only join if authenticated; the code just identifies which household

---

## 6. Frontend Architecture

### Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS v4
- **Charts:** Recharts 3
- **Icons:** Lucide React
- **Auth/DB/Storage:** Firebase (Auth + Firestore + Storage)

### Route Structure

```
/                   → Dashboard (main app shell, requires auth)
/login              → Login page
/signup             → Signup page
/onboarding         → Post-registration flow (create or join home)
/settings           → Household settings (members, invite code, rename)
```

All routes under `/` that require auth should check `useAuth().user` and redirect to `/login` if null.

### State Architecture

**AuthContext** (`lib/auth-context.tsx`) — global, wraps the whole app:
```typescript
{
  user: FirebaseUser | null
  loading: boolean
  households: Household[]
  currentHousehold: Household | null
  setCurrentHousehold: (h: Household) => void
  refreshHouseholds: () => Promise<void>
}
```

**Dashboard state** — local to `app/page.tsx`:
- `view: "dashboard" | "bills"`
- `utilityFilter: "all" | "electricity" | "gas" | "water"`
- `selectedBillId: string | null`
- `showHouseholdPicker: boolean`

**Data fetching** — for MVP, all data is fetched via Firestore SDK directly from client components. No server-side fetching needed yet. When Firebase is connected, replace mock data arrays in `lib/mock-data.ts` with live Firestore queries using `onSnapshot` for real-time updates.

### Component Structure

```
app/
  layout.tsx              ← root layout, wraps <Providers>
  providers.tsx           ← AuthProvider (client component)
  page.tsx                ← Dashboard (client, auth-required)
  login/page.tsx          ← Login (client, public)
  signup/page.tsx         ← Signup (client, public)
  onboarding/page.tsx     ← Onboarding flow (client, auth-required)
  settings/page.tsx       ← Household settings (TODO)

lib/
  types.ts                ← shared TypeScript types
  mock-data.ts            ← mock bills/spending data for mockup
  auth-context.tsx        ← React context for auth + households

lib/firebase/
  config.ts               ← Firebase app init (db, auth, storage)
  auth.ts                 ← signIn, signUp, signOut, resetPassword
  households.ts           ← createHousehold, getHouseholds, joinByCode
  bills.ts                ← getBillsByHousehold, createBill, getBill
  storage.ts              ← uploadBillPDF, getBillURL
```

---

## 7. Backend — Cloud Functions

Location: `functions/` (Node.js 20, TypeScript)

### `joinHousehold` (HTTPS Callable)

The only operation that can't be done safely client-side: a user adding themselves to a household they don't yet belong to.

```typescript
// Request
{ inviteCode: string }

// Response
{ householdId: string; nickname: string }

// Logic
1. Validate user is authenticated (context.auth)
2. Query households where inviteCode == request.inviteCode
3. If not found → throw "not-found"
4. If user already a member → throw "already-exists"  
5. FieldValue.arrayUnion(uid) on memberIds
6. Update users/{uid}.defaultHouseholdId = householdId
7. Return { householdId, nickname }
```

### `onBillUploaded` (Storage trigger)

Triggered when a PDF lands in `bills/{householdId}/{filename}`.

```typescript
// Trigger: functions.storage.object().onFinalize()
// Logic
1. Extract billId from file metadata (set at upload time)
2. Set bills/{billId}.parseStatus = "pending"
3. Download file buffer
4. Run pdf-parse to extract raw text
5. Detect provider from text (regex)
6. Run provider-specific parser → { totalAmount, usage, charges, ... }
7. Update bills/{billId} with parsed data + parseStatus = "success"
8. On error: set parseStatus = "failed", parseError = error.message
```

### `generateInviteCode` (HTTPS Callable)

Owner rotates their home's invite code.

```typescript
// Request: { householdId: string }
// Auth check: caller must be household.ownerId
// Logic: generate new 6-char code, check uniqueness, update doc
// Response: { inviteCode: string }
```

---

## 8. Bill Parsing

### Parser Design

Each provider gets its own parser file: `lib/parsers/{provider}.ts`

```typescript
export interface Parser {
  name: string           // "PG&E Electricity"
  detect: (text: string) => boolean  // returns true if text matches this provider
  parse: (text: string) => ParseResult
}
```

**MVP Parsers:**
- `lib/parsers/pge-electricity.ts` — PG&E E-1 rate plan
- `lib/parsers/pge-gas.ts` — PG&E G-1 rate plan
- `lib/parsers/ebmud-water.ts` — East Bay MUD

**Parser approach:**
1. Extract key fields with regex: `totalAmount`, `billingPeriodStart`, `billingPeriodEnd`, `usage`
2. Extract line items by scanning for known charge labels
3. Calculate `unitPrice = totalAmount / usage`
4. Return success with structured data, or failure with the raw text preserved

**Why deterministic (no AI):**
PDF layouts for a given provider + rate plan are highly consistent. A regex parser is fast, free, auditable, and gives exactly reproducible results. AI extraction would add cost, latency, and unpredictable failures. If a new provider is added, write a new parser file.

---

## 9. Security Model

### Firestore Rules Summary

| Collection | Read | Write |
|---|---|---|
| `users/{uid}` | Own user only | Own user only |
| `households/{hid}` | Members only (via memberIds) | Create: owner; Update: owner; Join: via Cloud Function |
| `bills/{bid}` | Members of bill's household | Members of bill's household |

### Firebase Storage Rules

```
match /bills/{householdId}/{filename} {
  allow read: if request.auth != null
    && request.auth.uid in firestore.get(
         /databases/(default)/documents/households/$(householdId)
       ).data.memberIds;
  allow write: if request.auth != null
    && request.auth.uid in firestore.get(
         /databases/(default)/documents/households/$(householdId)
       ).data.memberIds;
}
```

Storage paths are structured as `bills/{householdId}/{timestamp}_{filename}` so rules can reference the household.

### What the invite code is NOT

The invite code is not an authentication credential. It only identifies a household. The actual authorization check is `request.auth != null` — only authenticated users can use a code. This means:
- An attacker who learns your code can join your household (low stakes — it's utility bills, not financial data)
- The owner can rotate the code anytime to revoke access
- Future: codes with per-user expiry for more sensitive households

---

## 10. Environment Setup

```bash
# .env.local — copy from .env.local.example
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

**Firebase Console checklist:**
1. Authentication → Sign-in method → Email/Password → Enable
2. Firestore Database → Create database → Production mode
3. Storage → Get started
4. Deploy rules: `firebase deploy --only firestore:rules,storage`
5. Deploy indexes: `firebase deploy --only firestore:indexes`
6. Deploy functions: `firebase deploy --only functions`

**Local emulator (recommended for dev):**
```bash
firebase emulators:start --only auth,firestore,storage,functions
```
Set `NEXT_PUBLIC_USE_EMULATOR=true` to point the SDK at localhost.

---

## 11. Development Roadmap

### Phase 1 — MVP (current)
- [x] Firestore schema design
- [x] Firebase Auth (email/password)
- [x] Household creation + invite code
- [x] Join household flow
- [x] Dashboard mockup with mock data
- [x] Login + signup pages
- [x] Onboarding flow
- [ ] Connect dashboard to live Firestore data
- [ ] PDF upload UI
- [ ] PG&E electricity parser
- [ ] Bill detail view with parsed data

### Phase 2 — Core product
- [ ] PG&E gas parser
- [ ] East Bay MUD water parser
- [ ] `onBillUploaded` Cloud Function (auto-parse on upload)
- [ ] Settings page (manage members, rotate invite code, rename home)
- [ ] Password reset flow
- [ ] Month-over-month email digest (optional)

### Phase 3 — Growth
- [ ] Multi-provider support (add parser per new provider)
- [ ] Year-over-year comparison
- [ ] Budget alerts ("gas above $X/month")
- [ ] Bill export (CSV)
- [ ] Apple Sign-In / Google Sign-In

---

## 12. Key Design Decisions & Rationale

| Decision | Rationale |
|---|---|
| Firestore (not Postgres) | Firebase ecosystem cohesion, real-time updates, no infra to manage, free tier generous enough for MVP |
| Invite code (not email invite) | Simpler, no email infrastructure needed, works via any messaging channel |
| Cloud Function for join | Can't safely write to another user's household doc from client without a server-side atomic check |
| Deterministic parsing | Predictable, free, auditable. AI adds cost and variance. One consistent PDF format per provider makes regex reliable |
| Mock data in frontend | Lets the product be reviewed and iterated on before the backend is wired up |
| nickname vs address | Addresses are formal and forgettable. Nicknames are personal ("The Maple House") and immediately identifiable when a user has multiple properties |
