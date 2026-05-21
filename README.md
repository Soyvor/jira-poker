# Jira Story Point Poker

Static Chrome extension and admin page for anonymous Jira story point voting backed by Supabase.

## What It Does

- Reads the current Jira ticket title, priority, and issue type from the open Jira page.
- Opens as a Chrome side panel from the extension icon.
- Lets the configured admin start a 15 second voting session for the current Jira ticket.
- Lets voters see the admin's active ticket and vote without opening that Jira issue themselves.
- Lets voters submit story points from `0.5` to `5`, including custom half-point values.
- Shows participants and vote status while voting is active.
- Reveals anonymous votes and the average rounded to the nearest `0.5`.
- Keeps ticket/session/vote records expiring after one day. Usernames, admin flags, and the admin password setting persist.

## Supabase Setup

1. Open the Supabase SQL editor for `https://muzwzxewfkwappezcgzx.supabase.co`.
2. Run [supabase/schema.sql](/Users/yshukla/Documents/task-pointer/supabase/schema.sql).
3. Add users in the admin site or insert them directly into `profiles`.

The schema sets the admin-site password to `pgtjira26`. The admin page calls password-checked database functions to add users and toggle the admin view.

## Load The Chrome Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select [extension](/Users/yshukla/Documents/task-pointer/extension).
5. Open a Jira issue and click the extension icon. Chrome opens the extension as a side panel.

## Material UI Bundle

The extension uses local bundled Material Web components from `@material/web`, not the CDN, so it works as an unpacked MV3 Chrome extension. If you change [extension/material-entry.js](/Users/yshukla/Documents/task-pointer/extension/material-entry.js), rebuild with:

```shell
npm run build:material
```

## Open The Admin Site

Open [admin-site/index.html](/Users/yshukla/Documents/task-pointer/admin-site/index.html) in a browser. Use password `pgtjira26`, then add usernames and toggle who receives the extension admin view.

## Privacy Note

The extension stores votes with a per-session hash, not the username. Participant presence is stored separately so the admin can see who has joined or voted without seeing each person's point value. Because this is a browser-only app using a publishable Supabase key, it is not a strong security boundary against a technical user inspecting network traffic. For strict anonymity and access control, add Supabase Auth plus a small backend or Edge Function.
