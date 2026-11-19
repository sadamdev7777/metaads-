# MTB Marketing AI

One place to run Muslimtravelbug's Facebook Ads campaigns: load products from TravelCRM, keep media,
launch campaigns by hand or with AI, and see cost per pax by country and by who ran the campaign.

This repository holds **Phase 0**: every screen with sample data, sign-in, and an activity log.
Nothing in this phase reads from or writes to Meta.

## Stack

- React, TypeScript, Vite, Tailwind CSS
- Supabase: Postgres, Auth (email and password), Row Level Security
- Netlify for hosting

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

Without the two environment variables the app runs in **demo mode**: sign-in is not checked and the
activity log is kept in the browser only. The UI says so clearly.

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, for example `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | The publishable key of the project |

Both are publishable values. Never put a service role key or any other secret in this repo or in a
`VITE_` variable, because everything with that prefix is shipped to the browser.

## Database

`supabase/migrations/0001_init.sql` creates the schema and the access rules.
`supabase/migrations/0002_seed_sample.sql` adds sample rows, all marked `is_sample = true`.

Access rules:

- Any signed-in user can read and write every table. There are no roles.
- `activity_log` can be read and added to. There is no update or delete policy, so the record of who
  did what cannot be changed from the app.

Accounts are created in the Supabase dashboard under Authentication. There is no open sign-up.

## What is live and what is sample in Phase 0

| Area | Source |
| --- | --- |
| Sign-in | Supabase Auth |
| Activity log, Settings → Users | Supabase |
| Settings → Rules | Supabase (`rules` table), saved for real |
| Settings → Integrations | Supabase (`integration_status`), real status |
| Everything else | Sample data in `src/lib/data.ts` |

## Phases

0. Foundation (this repo today)
1. Read only: TravelCRM, Meta Ads, website form, matching, tagging
2. Actions with approval
3. Campaigns: media library, manual copy, AI draft
4. Auto mode, WhatsApp reports, Conversions API
