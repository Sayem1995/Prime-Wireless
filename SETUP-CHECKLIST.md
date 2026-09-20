# Prime Wireless — launch checklist

Written for the state of things on **19 Sep 2026**. Work top to bottom; steps 1–4
are blocking, 5–7 are needed before real customers, 8 is housekeeping.

Anything marked ✅ is already done and verified in the repo — you can skip it.

---

## Step 1 — Firebase: create the database *(BLOCKING)*

The `prime-wireless` project exists but has no database yet. Right now the API
returns this, which is how I could tell:

> `Cloud Firestore API has not been used in project prime-wireless before or it is disabled.`

1. Open <https://console.firebase.google.com/project/prime-wireless/firestore>
2. Click **Create database**
3. Choose **Production mode** (deny-all rules). Do *not* pick test mode — test
   mode leaves your customer data world-readable for 30 days.
4. Pick a location close to Philadelphia, e.g. **`us-east4` (N. Virginia)** or
   **`us-east1`**. ⚠️ **This cannot be changed later** — changing it means
   creating a new project and migrating.
5. Confirm.

Firestore enabled = the "Cloud Firestore API" turns on automatically. Nothing
else to enable by hand.

---

## Step 2 — Firebase: turn on staff logins *(BLOCKING)*

Without this nobody can sign in, so the admin panel is unreachable.

1. Open <https://console.firebase.google.com/project/prime-wireless/authentication/providers>
2. Click **Get started** if prompted.
3. Under *Sign-in method* → **Email/Password** → toggle **Enable** → **Save**.
   (Leave "Email link / passwordless" off.)

---

## Step 3 — Firebase: publish the security rules *(BLOCKING)*

The repo already contains the rules, but they have to be uploaded to this
project. I cannot do this for you — the Firebase CLI needs an interactive login
on this machine.

1. Open a terminal in the project folder.
2. Run:
   ```bash
   npm install
   npx firebase login
   ```
   A browser window opens; sign in with the Google account that owns
   `prime-wireless`.
3. Deploy the rules:
   ```bash
   npm run deploy:rules
   ```
   `.firebaserc` already points at `prime-wireless` ✅, so this is correctly
   scoped and cannot touch the Philly database.

**Expected output:** `✔ firestore: released rules firestore.rules to cloud.firestore`

---

## Step 4 — Vercel: connect this repo and set the variables *(BLOCKING)*

1. Go to <https://vercel.com/new> and import **`Sayem1995/Prime-Wireless`**.

   > ⚠️ If a Vercel project already claims the `prime-wireless` name, check
   > **which GitHub repo it is connected to**. Right now
   > `https://prime-wireless.vercel.app` is serving your **Philly** site — so
   > something is pointed at the wrong repo. Fix that, or use a different
   > project name.

2. Before deploying, open **Settings → Environment Variables** and add the block
   from Step 4a below (Production **and** Preview).

3. **Also enable:** Settings → General → **"Enable access to System Environment
   Variables"**. This is what lets the server authenticate to Firebase without a
   password key. Without it, every database-backed page fails.

### 4a. Environment variables to paste

```
VITE_FIREBASE_API_KEY=AIzaSyBYlB024MNHU6i1lJuM5um7NU1JVBvzc8
VITE_FIREBASE_AUTH_DOMAIN=prime-wireless.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=prime-wireless
VITE_FIREBASE_STORAGE_BUCKET=prime-wireless.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=298379304799
VITE_FIREBASE_APP_ID=1:298379304799:web:ea5193274773286a63e0ea

BRAND_NAME=Prime Wireless
BRAND_STREET=25 South 19th Street
BRAND_CITY=Philadelphia, PA 19103
BRAND_PHONE=(814) 384-1507
BRAND_EMAIL=mr.sayemulhaque@gmail.com
BRAND_WHATSAPP=18143841507
BRAND_HOURS=Monday-Saturday|10 AM-10 PM;Sunday|11 AM-9 PM
BRAND_SITE_URL=https://YOUR-REAL-DOMAIN.com

GCP_WORKLOAD_IDENTITY_PROJECT_NUMBER=298379304799
```

> These are *non-secret* identifiers. The Firebase web config is public by
> design — it ships inside the browser JavaScript of every Firebase site.

4. **Deploy.**

---

## Step 5 — Firebase: make yourself the admin *(needed to use the admin panel)*

The admin panel is locked to accounts whose `role` is `"admin"`.

1. Go to your deployed site and **sign up** with your own email at `/login`.
2. Open <https://console.firebase.google.com/project/prime-wireless/authentication/users>
   and copy the **User UID** for that account.
3. Open <https://console.firebase.google.com/project/prime-wireless/firestore/data>
   → collection **`users`** → open the document whose ID matches that UID.
4. Change the field **`role`** from `"customer"` to **`"admin"`** → Update.
5. Sign out and back in. You can now reach `/admin`.

*(Alternative: set `FIREBASE_ADMIN_UID` to that UID before the first sign-in and
it gets the admin role automatically.)*

---

## Step 6 — Seed the price list and product catalogue *(optional)*

Gives the site the starter catalogue of repair prices, devices and accessories.

```bash
npm run db:seed
```

> ⚠️ **Not idempotent.** Running it twice **appends a second copy** of everything
> rather than updating in place. Run it once.

---

## Step 7 — Email delivery *(needed before taking real bookings)*

Right now **no email is sent at all**. Booking confirmations and "your device is
ready" messages are written into the CRM history but never delivered to the
customer — silently. Nothing errors; they just never arrive.

Pick one:

**Option A — Brevo (recommended, free 300/day, works over HTTPS):**
1. Sign up at <https://www.brevo.com>
2. Get an API key from *SMTP & API → API Keys*
3. Verify your sender address
4. Add to Vercel: `BREVO_API_KEY=…` and `BREVO_FROM=mr.sayemulhaque@gmail.com`

**Option B — Gmail SMTP:**
1. Enable 2-step verification on the Google account
2. Create an **App Password** (not your normal password) at
   <https://myaccount.google.com/apppasswords>
3. Add to Vercel:
   `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
   `SMTP_USER=mr.sayemulhaque@gmail.com`, `SMTP_PASS=<16-char app password>`

Also set `STAFF_EMAIL=mr.sayemulhaque@gmail.com` so you are alerted about new
bookings.

> SMS is optional and separate — it needs a Twilio account. Skip for now.

---

## Step 8 — The real domain *(don't skip — it affects search ranking)*

`BRAND_SITE_URL` currently points at `https://prime-wireless.vercel.app`, which
**serves your Philly site**. That means this store's canonical link and
schema.org listing point at the wrong business. Bad for both stores on Google.

1. Buy or choose a domain (e.g. `primewirelessphilly.com`).
2. Vercel → Project → **Settings → Domains** → add it, then follow the DNS
   instructions (usually one `A` record and one `CNAME`).
3. Update the variable in **both** places:
   - Vercel → Settings → Environment Variables → `BRAND_SITE_URL`
   - `contracts/brand.ts` → the `readString([...], "https://…")` default
4. Redeploy.

---

## Quick sanity check once deployed

Visit `https://YOUR-DOMAIN/api/health`. You want to see:

```json
{"ok":true,"projectId":"prime-wireless","credentialSource":"workload_identity_federation","firestore":"reachable"}
```

Read it like this:

| Field | Meaning |
| --- | --- |
| `ok: true` | all good |
| `credentialSource: "none"` | Step 4.3 toggle is off — server can't reach Firebase |
| `firestore: "unreachable"` | database not created (Step 1) or rules not deployed (Step 3) |
| `projectId: "philly-repair"` | you're looking at the Philly site, not Prime |

---

## Already done — no action needed

- ✅ Code in `Sayem1995/Prime-Wireless` with Prime Wireless as its built-in
  identity (name, 19th Street address, 19103, hours, navy/electric-blue theme)
- ✅ Real contact details: `(814) 384-1507`, `mr.sayemulhaque@gmail.com`
- ✅ Firebase web config wired in and verified reaching the browser
- ✅ `.firebaserc` pointed at `prime-wireless` (it previously targeted the live
  Philly database — fixed)
- ✅ `npm run build` unblocked; typecheck, lint and 102 tests all pass
