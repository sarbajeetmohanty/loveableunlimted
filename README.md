# Loveable Unlimited — Extension & License Dashboard

Complete solution for **Loveable Unlimited (v17.5)** Chrome Extension with custom **Supabase** backend and **Next.js** License Management Dashboard.

---

## 📁 Repository Structure

```
├── bundlee_extracted/       # Chrome Extension (Manifest V3)
│   ├── manifest.json        # Extension manifest
│   ├── powerkits-core.js    # Core UI & license client
│   ├── background.js        # Background service worker
│   ├── pageHook.js          # Creator injection & API interceptor
│   └── ...
│
├── dashboard/               # Next.js License Admin Dashboard
│   ├── src/app/page.tsx     # Dashboard UI (Key generator, stats, revoke)
│   ├── src/app/api/         # License CRUD API routes
│   └── ...
│
└── supabase/
    ├── migrations/
    │   └── fix_complete_schema.sql  # Complete database schema & RLS
    └── functions/
        ├── activate/index.ts        # License activation Edge Function
        └── proxy-command/index.ts   # Server-side proxy command function
```

---

## 🚀 Quick Setup

### 1. Database Setup (Supabase)
Run the SQL script [`supabase/migrations/fix_complete_schema.sql`](supabase/migrations/fix_complete_schema.sql) in your **Supabase Dashboard** -> **SQL Editor**.

### 2. Deploy Edge Functions
```bash
supabase functions deploy activate --no-verify-jwt
supabase functions deploy proxy-command --no-verify-jwt
```
*(Make sure **Enforce JWT Verification** is **Disabled**)*

### 3. Run License Dashboard
```bash
cd dashboard
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to generate and manage license keys.

### 4. Load Extension in Chrome
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `bundlee_extracted/` folder.
4. Enter any license key generated from your dashboard!
