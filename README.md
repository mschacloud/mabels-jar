# mabels-jar
sourdough tracking helper site

**Mabel's Jar** is a phone-first sourdough starter journal: log feeds, rise checks against the hair tie, smells and photos, and a built-in coach tells you when to check her, how warm your kitchen runs (no thermometer needed) and when she's ready to bake.

Live site: https://mschacloud.github.io/mabels-jar/

## Using it
- Open the site on your phone, make an account, and sign in.
- **Add to Home Screen** to use it like an app (iPhone: Safari → Share → Add to Home Screen; Android: Chrome menu → Install app).
- **Ask** tab: copies your question plus the whole journal and opens Claude on your own account. No paid AI service is involved.
- **Settings (☰)**: import a history file, download a backup, change the starter's name or usual feed time, sign out.

## How it's built
- Plain HTML, CSS and JavaScript, hosted free on GitHub Pages. No build step.
- [Supabase](https://supabase.com) free tier for sign-in, the journal database and private photo storage.
- `supabase/setup.sql` creates the tables, turns on row level security, and makes the private `photos` bucket. Run it in the Supabase SQL Editor.
- `config.js` holds the Supabase project URL and the **publishable (anon) key**. Those are public by design. Never put the service_role / secret key in this repo.

## Security
- Row level security on every table and on the photo bucket: each signed-in person can read and change only their own rows and photos. Signed-out visitors get nothing.
- Photos live in a private bucket and are shown through short-lived signed links.
- Email + password sign-in (10+ characters), handled by Supabase Auth.
- A strict Content Security Policy: scripts load only from this site (the Supabase library is vendored in `vendor/`).
- No personal data, journal entries or photos are stored in this repository.
