# Prime Wireless

Storefront and back-office for **Prime Wireless** — a phone, tablet and laptop
repair shop at 25 South 19th Street, Philadelphia PA 19103. Open Monday–Saturday
10 AM–10 PM, Sunday 11 AM–9 PM.

Storefront and back-office for a Philadelphia phone/tablet/laptop repair shop:
public marketing pages, a multi-step repair booking flow, and an admin CRM
(bookings, customers, inventory, pricing, reports).

## Stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, Vite 7, TypeScript, Tailwind v3, shadcn/ui    |
| Routing  | `react-router` v7                                       |
| API      | Hono + tRPC v11 (superjson), served via `@hono/node-server` |
| Data     | Firebase (Firestore + Auth), `firebase-admin` on the server |
| Email    | SendGrid Web API or SMTP (`nodemailer`), both optional  |
| Tests    | Vitest                                                  |

The app runs in three shapes from the same code:

- **Vite dev server** — `npm run dev` (Hono is mounted in-process via `@hono/vite-dev-server`).
- **Node server / Docker** — `npm run build` then `node dist/boot.js`.
- **Vercel / Firebase** — `api/index.js` requires the prebuilt `api/_app.cjs` bundle; Firebase Hosting rewrites `/api/**` to the `api` function.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # http://localhost:3000
```

The app **boots without Firebase credentials** so the marketing pages render;
only Firestore/Auth-backed routes fail until they are configured.

## Branding is configuration, not code

Everything store-specific — name, wordmark, tagline, address, phone, email,
WhatsApp, opening hours, domain, logo and the whole colour palette — is resolved
from the environment in **`contracts/brand.ts`**, which is the single source of
truth. **Prime Wireless's values are the built-in defaults**, so this repo
renders the correct shop even with nothing configured, and a missing variable
can never fall back to a different storefront's name or phone number.

It is read by:

| Consumer | How it gets the value |
| --- | --- |
| React pages | `import { BRAND, STORE } from "@contracts/constants"` |
| `<head>` title / description / canonical / JSON-LD | the `brand()` plugin in `vite.config.ts` rewrites `__BRAND_*__` tokens in `index.html` at build time |
| Site palette | the same plugin replaces `@brand-*` tokens in `src/index.css`; `tailwind.config.js` maps them to `rgb(var(--brand-x) / <alpha-value>)` |
| Email + SMS templates | `BRAND` and `STORE` on the server (email clients cannot use CSS variables, so the palette is interpolated as literal hex) |

Page components use Tailwind class names such as `burgundy` and `blush`. Those
names are historical — only their *values* are branded, and they resolve to this
store's navy and electric blue through the theme variables above.

Because Vite only exposes `VITE_`-prefixed variables to the browser, each brand
value has two accepted spellings. `readBrand()` prefers the server-side one:

| Browser (`VITE_`) | Server |
| --- | --- |
| `VITE_BRAND_NAME` | `BRAND_NAME` |
| `VITE_BRAND_PHONE` | `BRAND_PHONE` |
| `VITE_BRAND_HOURS` | `BRAND_HOURS` |
| … | … |

> **Placeholders are still in place.** The contact phone number, email address
> and production domain were not known when this repo was created, so they are
> placeholders: `(215) 555-0100`, `hello@primewireless.example` and
> `https://prime-wireless.vercel.app`. Replace them in `contracts/brand.ts`
> (`DEFAULT_*` values) and in `.env` before going live. **`npm run build`
> deliberately fails while they remain**, so a store with fake contact details
> cannot be deployed unnoticed.

### Opening hours

`BRAND_HOURS` uses an explicit, unambiguous format — one row per `;`, days and
times separated by `|`, day ranges separated by `,`:

```
BRAND_HOURS=Monday-Saturday|10 AM-10 PM;Sunday|11 AM-9 PM
```

This feeds the footer summary, the contact page and the schema.org
`openingHours`, so opening times stay consistent everywhere. An unparseable
value fails the build loudly rather than silently showing the wrong hours.

## This store's own Firebase project

Prime Wireless runs against its own Firebase project, so its bookings, customers,
inventory and staff accounts are completely separate from any other shop.

1. **Create the Firebase project** (Firestore + Email/Password auth).
2. **Fill in `.env`** from `.env.prime.example`, including the `VITE_FIREBASE_*`
   web config and `FIREBASE_PROJECT_ID`.
3. **Point `.firebaserc`** at the new project id.
4. **Deploy the rules and seed the catalog**:
   ```bash
   npm run deploy:rules
   npm run db:seed
   ```
5. **Deploy** to this store's own Vercel project.

> ⚠️ Set `FIREBASE_ADMIN_UID` to the UID that should become admin, or promote
> that user's `role` to `"admin"` in the `users` collection. Otherwise nobody can
> open the admin panel.

### Environment variables

Frontend values are exposed to the browser by Vite and must be prefixed `VITE_`.
Server values must never use that prefix.

| Variable                                                       | Purpose                                       |
| -------------------------------------------------------------- | --------------------------------------------- |
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_APP_ID`                | Firebase **web** config (client auth)         |
| `FIREBASE_PROJECT_ID`                                           | Firebase project id (used by Admin SDK)       |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`                 | **Legacy** service-account credentials (see below) |
| `FIREBASE_ADMIN_UID`                                            | Marks this Firebase UID as `admin` on sign-in |
| `GCP_WORKLOAD_IDENTITY_*`, `GCP_SERVICE_ACCOUNT_EMAIL`          | **Preferred** keyless auth (see below)        |
| `SENDGRID_API_KEY` / `SENDGRID_FROM`                            | Email via SendGrid Web API (preferred)        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email via SMTP fallback                       |
| `STAFF_EMAIL`                                                   | Recipient for new-booking notifications       |

When no email provider is configured, `sendEmail()` returns
`{ delivered: false }` and the message is recorded in the CRM communication
history instead — bookings still succeed.

### Customer notifications (email + SMS)

Customers are told about their repair on **every channel you hold for them** —
email if they gave one, SMS if they gave a phone number:

| Event | Message |
| --- | --- |
| Booking created | "We've got your booking" + reference, device, date and time |
| Status → `accepted` | "Your repair has been accepted" |
| Status → `in_progress` | "Your repair is underway" |
| Status → `completed` | "Your device is ready to collect" + warranty date and opening hours |
| Status → `rescheduled` | "Your appointment has moved" + the new slot |
| Status → `cancelled` | "Your appointment was cancelled" |

Status messages fire **only when the status actually changes**, so re-saving a
note or a price estimate never spams the customer. Every attempt — and whether it
was genuinely delivered — is recorded in the `notifications` collection, so the
shop can see exactly what the customer was told.

Delivery is best-effort and per-channel: a failed email still lets the SMS
through, and a missing provider is logged as `(queued — … not configured)`
rather than failing the booking or the status change.

- **Email** — `SENDGRID_API_KEY` + `SENDGRID_FROM` (preferred, HTTPS), or
  `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`.
- **SMS** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
  (E.164, e.g. `+12155550123`). Sent through the Twilio REST API over `fetch`,
  so no extra dependency is bundled into the serverless function.
- **`STAFF_EMAIL`** — where new-booking alerts are sent.

`FIREBASE_PRIVATE_KEY` may contain literal `\n` escapes; they are converted to
real newlines at load time, and wrapping quotes are stripped.

### Keyless Google Cloud authentication (recommended)

Storing a service-account private key is a long-lived secret. Many Google Cloud
organizations forbid key creation outright (`Key creation is not allowed on this
service account`). The supported alternative — and Google's documented
preference for external workloads — is **Workload Identity Federation**.

Vercel issues a short-lived OIDC token (RS256, ~2h) for every request. The server
exchanges it at Google's Security Token Service and impersonates the Firebase
Admin service account, yielding a short-lived access token. **No private key
exists anywhere.**

```
Vercel request ──x-vercel-oidc-token──► AsyncLocalStorage
                                             │ (subject_token_supplier)
                                             ▼
                                    IdentityPoolClient
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
             sts.googleapis.com/v1/token            iamcredentials:generateAccessToken
                       └─────────────────────┬─────────────────────┘
                                             ▼
                              short-lived token → @google-cloud/firestore
```

Set these **non-secret** variables (Production, plus Preview if you want
preview deploys to work):

```
GCP_WORKLOAD_IDENTITY_PROJECT_NUMBER   # GCP project number
GCP_WORKLOAD_IDENTITY_POOL_ID          # e.g. vercel-pool
GCP_WORKLOAD_IDENTITY_PROVIDER_ID      # e.g. vercel
GCP_SERVICE_ACCOUNT_EMAIL              # the Firebase Admin service account
```

**Also required (dashboard toggle):** Vercel → Project → Settings → General →
**"Enable access to System Environment Variables"** (OIDC federation). Without
it, no `x-vercel-oidc-token` header is sent and requests fail with a clear
"no Vercel OIDC token" error.

The Google Cloud side (Workload Identity Pool, OIDC provider, and the
`roles/iam.workloadIdentityUser` binding scoped to this project's production
deployments) is a one-time setup done by a project owner.

**Two things that bite during setup:**

1. **The team slug must match exactly.** The Vercel OIDC `iss` claim is
   `https://oidc.vercel.com/<team-slug>`; Google compares it as an exact string.
   The same slug also appears in the impersonation binding's subject
   (`owner:<team-slug>:project:<project>:environment:<environment>`), so a wrong
   slug breaks both places. Confirm the real slug in the Vercel dashboard, or
   read it from the error message — the token reports its own issuer.
2. **The principalSet `attribute.<name>` must be a mapped attribute.** Referencing
   an attribute you did not declare in `--attribute-mapping` produces an invalid
   member. This setup maps `attribute.sub=assertion.sub` explicitly for that reason.

Credential resolution order in `server/queries/firestore.ts`:

1. **Emulator** — `FIRESTORE_EMULATOR_HOST` (local dev, no credentials)
2. **Workload Identity Federation** — when the `GCP_WORKLOAD_IDENTITY_*` vars are set
3. **Service-account cert** — legacy `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
4. **Application Default Credentials** — Google-hosted runtimes

> Note: `firebase-admin`'s own `getFirestore()` accepts only a service-account
> cert or its internal ADC marker, and throws `invalid-credential` for anything
> else. The WIF path therefore constructs `@google-cloud/firestore` directly and
> injects the auth client. `firebase-admin/auth` is unaffected — verifying an ID
> token needs only the project id.


### Local development against the Firestore emulator

The emulator lets you work without touching production data. It requires a
Java runtime on your `PATH`.

```bash
npx firebase emulators:start --only firestore --project demo-philly
```

Then point the app and seed script at it (use the **same** project id for both,
otherwise they write to different emulator namespaces):

```bash
# PowerShell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FIREBASE_PROJECT_ID="demo-philly"
npm run db:seed
npm run dev
```

The Emulator UI is at <http://127.0.0.1:4000/>.

With `FIRESTORE_EMULATOR_HOST` set, the server falls back to Application
Default Credentials instead of a service account.

## Scripts

| Command                | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | Vite dev server with HMR + Hono API on port 3000                     |
| `npm run build`        | Builds `dist/public` (client), `dist/boot.js` (ESM server) and `api/_app.cjs` (Vercel CJS bundle) |
| `npm run start`        | Runs the production server (`node dist/boot.js`, needs `NODE_ENV=production`) |
| `npm run check`        | `tsc -b` typecheck across the app, node and server projects          |
| `npm run lint`         | ESLint                                                              |
| `npm test`             | Vitest (`api/**/*.test.ts`)                                         |
| `npm run format`       | Prettier                                                            |
| `npm run db:seed`      | Seeds Firestore with the starter catalog                            |
| `npm run deploy:rules` | Deploys `firestore.rules`                                           |
| `npm run deploy:hosting` | Builds and deploys Firebase Hosting                               |
| `npm run deploy:functions` | Builds and deploys the Firebase Functions API                  |

> `npm run lint` requires generated bundles (`api/_app.cjs`, `scripts/seed.js`)
> to be ignored — they are listed in `eslint.config.js` and `.gitignore`.

## Architecture notes

```
contracts/        Shared constants, error shapes and public types
server/
  boot.ts         Hono app: mounts tRPC at /api/trpc, static SPA fallback
  router.ts       Root tRPC router (ping, auth, shop, admin)
  middleware.ts   publicQuery / authedQuery / adminQuery guards
  context.ts      Per-request context; resolves the Firebase user
  lib/            env loading, Firebase token verification, HTTP + cookie utils
  queries/        Firestore data access (store.ts), id allocation, users
src/
  pages/          Route components (public site + admin/*)
  components/ui/  shadcn/ui primitives
  providers/      tRPC and Firebase Auth providers
scripts/seed.ts   Firestore seeding
api/index.js      Vercel serverless entry point
```

### Authentication

Firebase Auth is entirely client-side. The client attaches
`Authorization: Bearer <idToken>` to every tRPC request; the server verifies the
token with `firebase-admin`, then hydrates (or creates) the Firestore `users`
row. A user whose `role` is `"admin"` passes `adminQuery`; everyone else gets
`FORBIDDEN`.

### Firestore security

`firestore.rules` is the source of truth for direct client access. All
privileged reads/writes go through the tRPC layer, which enforces the role
check server-side.
