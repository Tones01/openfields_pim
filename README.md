# Open Fields PIM

The team's single place to add, fix and look up product information. Version 1.

**What it does**

- **Catalogue:** browse every product, with filters for status, category, producer, brand and "missing" fields, plus search by name, item number or GTIN.
- **Product record:** edit any field. Required gaps are highlighted, and completeness is worked out as you type. Every change is logged (who, what, before, after).
- **Add product:** one at a time. Product name and size can be filled in from the Variation Name.
- **Bulk upload:** drop in an intake form or any spreadsheet. Columns are matched automatically, and every row is checked before anything saves. Blank cells never wipe existing info.
- **Export to Excel:** downloads whatever the current filters show.
- **Team:** only people on the list can sign in. Admins manage the list. Editors change products. Viewers search and export.
- **Activity:** the full change history, filterable by product or person.

Item number is the key that links a product to D365, Power BI and the portal.

---

## Setting it up (about 15 minutes, one time)

### 1. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com), sign in with GitHub, and click **New project**.
   - Name: `openfields-pim`. Region: **Canada (Central)**. Save the database password somewhere safe.
2. When it's ready, open **SQL Editor**, then **New query**. Paste in the whole of `supabase/migrations/0001_init.sql` from this repo and click **Run**. You should see "Success. No rows returned".
3. Open **Project Settings > API** and keep that tab open. You'll need the **Project URL** and the **anon public** key in step 2.

### 2. Put the app online (Vercel)

1. Go to [vercel.com](https://vercel.com), sign in with GitHub, then **Add New > Project** and import `Tones01/openfields_pim`.
2. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon public key
3. Click **Deploy**. When it finishes, copy the site address (like `https://openfields-pim.vercel.app`).

### 3. Connect sign-in to the site

In Supabase, go to **Authentication > URL Configuration**:

- **Site URL:** your Vercel address
- **Redirect URLs:** add `https://YOUR-VERCEL-ADDRESS/auth/callback`

### 4. First sign-in and loading the products

1. Open the site and sign in with **your** email. The first person to sign in becomes the admin.
2. Go to **Bulk upload** and choose `Open Fields_Catalogue_V1.xlsx`. It picks the Catalogue sheet and matches every column. Click **Check rows**, then **Import**. All 4,256 products load in a few seconds.
3. Go to **Team** and add your editors and viewers by email. They can sign in straight away.

---

## Good to know

- **Sign-in emails:** Supabase's built-in email sender only allows a few emails per hour. That's fine for testing. Before the whole team starts signing in, add OFD's email server under **Authentication > Emails > SMTP settings** (IT can give you the details), or use a service like Resend.
- **Open the sign-in link in the same browser** you requested it from.
- **Nothing here writes to D365.** It's a separate system, linked to D365 by item number.
- **Status:** new products start as **New**. Set them to **Active** or **Delist** on the record, or include a Status column in an upload.
- **Uploads that update existing products:** you choose "leave them" or "update them" each time. When updating, only cells with values change anything. Names and sizes worked out from the Variation Name are only used for new products, so they never overwrite edits.

## For whoever maintains it

- Stack: Next.js 15 (App Router) + Supabase (Postgres, Auth). Hosted on Vercel.
- `supabase/migrations/0001_init.sql`: tables, roles, row-level security, the change-log trigger and the bulk upload function. Permissions are enforced in the database, not just the screens.
- `lib/fields.ts`: every product field in one list (label, section, required, column aliases for uploads). Add a field there and in a new migration.
- `lib/clean.ts`: how values are cleaned (sizes, GTIN check digit, potency ranges, statuses).
- Run locally: copy `.env.example` to `.env.local`, fill it in, then `npm install` and `npm run dev`.
- Tests: `npm test` (cleaning and column matching).
