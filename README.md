# Moreeh

Admin dashboard for J@rd and future apps: https://jojo-6000.github.io/moreeh/

- Sign in with an admin account. No secret keys live here: every action is checked by the app's server.
- To connect another app, open **Help → Connect a new app** in Moreeh, or use the files in `connector/`:
  - `connector/setup.sql` — run once in the app's Supabase SQL Editor.
  - `connector/moreeh/index.ts` — deploy as the Edge Function `moreeh` (Verify JWT off).
