# ZolaxTech Studio

A web app for running a weekly YouTube channel: a 41-video plan with dates that move when you move a video, a daily routine, a script editor with English and Amharic side by side, a teleprompter, a checklist per video, ideas, results and reviews.
It is the web version of the Excel planner and starts with the same 41 videos, 61 ideas and weekly routine.

- **Supabase**: sign-in (email and password) and the database.
- **SnapDeploy**: runs the small Node server (`server.js`) that serves the app and its API.
- No build step. The screens are plain JavaScript modules in `public/`.

## 1. Set up Supabase (about 5 minutes)

1. Create a project at supabase.com. Choose a region near you and save the database password somewhere safe.
2. Open **SQL Editor > New query**, paste the whole of `db/schema.sql`, and press **Run**. It is safe to run again later.
3. Open **Project Settings > API** and copy two values:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **anon public** key (newer dashboards call it the **publishable** key). Do **not** use the `service_role` / secret key. This app never needs it.
4. Open **Authentication > Providers > Email** and keep **Confirm email** turned **on**. After creating an account you open the link Supabase emails you, then sign in.
5. After SnapDeploy gives you your address (step 2 below), open **Authentication > URL Configuration**. Set **Site URL** to your SnapDeploy address, and add it to **Redirect URLs**. Password-reset and confirmation emails use this.
6. Keep **Confirm email** turned **on** (see step 4), because the approved-people check relies on confirmed addresses. See **Who can sign in** below for adding people.

## 2. Deploy on SnapDeploy

1. Put this folder in a GitHub repository (`.env` and `node_modules` are already ignored).
2. In SnapDeploy, create a new container from that GitHub repository. No Dockerfile is needed: it detects Node and Express, runs `npm install`, and starts the app with `npm start`. `.nvmrc` picks Node 20.
3. Add these **environment variables** in the container settings (do not set `PORT`; SnapDeploy sets it and the app reads it):
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY` from step 1.
   - `ALLOWED_EMAILS`: the email addresses allowed to use the app, separated by commas, for example `you@gmail.com,editor@gmail.com`. The app will not start without it.
   - `PUBLIC_URL` set to your container address, for example `https://your-name.containers.snapdeploy.app` (or your own domain). This makes sign-in links and the Google redirect address come out right.
4. Deploy. SnapDeploy checks `/api/health`, which the app answers. Open the address, create your account, and your plan is created automatically. The first Tuesday on or after today becomes week 1; change it in **Settings**.
5. Optional: add your own domain under the container's Domains section (free SSL). Then use that address for `PUBLIC_URL`, the Supabase Site URL and the Google redirect.

Free plans have limits that change over time, so check SnapDeploy's and Supabase's current pages. At the time of writing, a free SnapDeploy container sleeps after about 15 minutes without visitors and takes about a minute to wake (the app shows a "Waking up the server" message), the free plan has a monthly hours limit and a daily deploy limit, and a free Supabase project can pause after a long period of no use; you restore it from the dashboard. Always-on hosting is a paid option.

### Who can sign in

This is a private studio. The server checks every request: an account gets in only if its email is in `ALLOWED_EMAILS` **and** the email has been confirmed. Anyone else who signs up sees "This account is not approved" and can read or change nothing. The email check is not case sensitive.

- **Add a person:** add their email to `ALLOWED_EMAILS` in SnapDeploy and redeploy (or restart). They then either create an account on the sign-in page and confirm their email, or you invite them in Supabase under **Authentication > Users > Invite user**; they open the link and choose a password.
- **Remove a person:** take their email out of `ALLOWED_EMAILS` and restart. Their data stays in the database until you delete the user in Supabase.
- **Recommended extra lock:** in Supabase, **Authentication > Sign In / Providers**, turn off **Allow new users to sign up**, and add people only with **Invite user**. Strangers then cannot even create an account.
- Each approved person sees only their own plan, scripts and ideas. People do not share data.
- For local trials only, `ALLOW_ANY_SIGNED_IN=true` lets any account in. Never set it on the hosted app.

## 3. Connect Google Workspace (optional, about 10 minutes)

This adds three things: your schedule on **Google Calendar**, each script as a **Google Doc** (English and Amharic side by side), and the video list as a **Google Sheet**. It works one way, from Studio to Google. The app only asks for two permissions: create and edit calendar events, and see only the files it creates itself in your Drive. It never reads your other files or events.

1. Go to console.cloud.google.com, create a project (any name), then open **APIs & Services > Library** and enable **Google Calendar API** and **Google Drive API**.
2. Open **APIs & Services > OAuth consent screen** (called **Google Auth Platform** in newer consoles). Choose **External**, fill in the app name and your email, and add your own Google address as a **test user**.
3. Open **Credentials > Create credentials > OAuth client ID**, type **Web application**, and under **Authorized redirect URIs** add exactly `https://YOUR-APP-ADDRESS/google/callback` (and `http://localhost:3000/google/callback` if you also run it locally).
4. Copy the **Client ID** and **Client secret** into the SnapDeploy environment variables as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Also add `TOKEN_KEY`: any long random text, made for example with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Run `db/schema.sql` again in Supabase (it adds the Google tables and is safe to repeat).
5. Open the app, go to **Settings > Google Workspace**, and press **Connect Google**.

Good to know:
- While the Google project is in **Testing** mode, Google expires the connection after 7 days and you press Connect again. To avoid that, open the OAuth consent screen and press **Publish app**. For a personal tool you do not need Google's review: you will just see an "unverified app" warning once, and you can continue.
- **Sync to Google Calendar** is safe to press as often as you like. It adds missing events, moves the ones whose dates changed, and removes events for videos you deleted. Published videos stay on the calendar as they were.
- **Update Google Doc** replaces the document's text, so edit the script in Studio and use the Doc for sharing or printing.
- The Drive folder **ZolaxTech Studio** holds the Doc and Sheet files the app creates.
- **Disconnect Google** revokes the app's access and deletes the stored token.
- The Google refresh token is stored encrypted (AES-256-GCM) with `TOKEN_KEY`, which lives only in the SnapDeploy environment variables. Do not change `TOKEN_KEY` later, or press Connect Google again if you do.

## Optional: put the website on Cloudflare Pages (yourname.pages.dev)

Pages hosts only the website; the backend stays on SnapDeploy and Pages forwards `/api/*` to it.
1. Push this folder to GitHub. In Cloudflare: **Workers & Pages > Create > Pages > Connect to Git**.
2. Project name = your address (`zolaxtech` gives `zolaxtech.pages.dev`). Framework: None. Build command: `npm install && node scripts/build-pages.js`. Output directory: `public`.
3. Add the environment variable `BACKEND_URL` = your SnapDeploy address (no trailing slash), then deploy.
4. Set `PUBLIC_URL` on SnapDeploy, the Supabase **Site URL / Redirect URLs**, and the Google redirect URI (`/google/callback`) to the pages.dev address.

## 4. Run it on your computer

```bash
npm install
cp .env.example .env     # then fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm start                # http://localhost:3000
```

To try the screens with no Supabase or Google account at all (data lives in memory and disappears when you stop it; any email and password work):

```bash
node test/dev.js         # http://localhost:3100
npm test                 # API tests
```

## How it keeps your data safe

- Every table has a `user_id` and **row-level security**: a signed-in person can only read and change their own rows.
- The browser signs in with Supabase and sends its token to the server. The server checks the token, then talks to the database **as that person**, so the database rules still apply. There is no `service_role` key anywhere, so a bug in the server cannot expose other people's rows.
- The Supabase URL and anon key are public by design. They are sent to the browser.
- Text is always inserted into the page as text, never as HTML, and the server sends a strict Content-Security-Policy.

## How it maps to the Excel planner

| Excel sheet | Screen |
| --- | --- |
| Content Calendar | Pipeline (board, list, calendar) |
| Weekly Routine, Video Checklist | Today, and the Checklist tab of each video |
| Script Template | Script tab of each video, and Playbook |
| Idea Bank | Ideas |
| Calendar file (.ics) | Google Calendar sync, or the .ics export |
| The whole workbook | Google Sheets export |
| Tools, Rules and Tips | Playbook |
| Monthly Review, Progress | Review, Dashboard |

Dates are never stored. They are calculated from a video's week number, the first recording Tuesday and the publish day, so moving a video moves every date after it, like the spreadsheet.

## Handy things

- `Ctrl K` (or `⌘K`) opens search and quick actions.
- Teleprompter: Space starts and pauses, Up and Down change the speed, Esc closes.
- Settings can export the schedule as a calendar file for Google Calendar, and the video list as CSV.
- The app can be installed from the browser menu on a phone or computer.

## Project layout

```
server.js            starts the server
src/                 API (Express): auth check, routes, date, calendar and Google helpers
db/schema.sql        tables, security rules and functions for Supabase
data/                the starting plan, ideas, routine, checklist and playbook
public/              the web app (HTML, CSS, JavaScript modules)
test/                API tests and an in-memory Supabase for local trials
```
