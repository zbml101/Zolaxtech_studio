# ZolaxTech Studio

A web app for running a weekly YouTube channel: a 41-video plan with dates that move when you move a video, a daily routine, a script editor with English and Amharic side by side, a teleprompter, a checklist per video, ideas, results and reviews.
It is the web version of the Excel planner and starts with the same 41 videos, 61 ideas and weekly routine.

- **Supabase**: sign-in (email and password) and the database.
- **Render**: runs the small Node server (`server.js`) that serves the app and its API.
- No build step. The screens are plain JavaScript modules in `public/`.

## 1. Set up Supabase (about 5 minutes)

1. Create a project at supabase.com. Choose a region near you and save the database password somewhere safe.
2. Open **SQL Editor > New query**, paste the whole of `db/schema.sql`, and press **Run**. It is safe to run again later.
3. Open **Project Settings > API** and copy two values:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **anon public** key (newer dashboards call it the **publishable** key). Do **not** use the `service_role` / secret key. This app never needs it.
4. Open **Authentication > Providers > Email**. For a one-person app you can turn **Confirm email** off, so you can sign in right after creating the account. If you leave it on, the app shows "Check your email" and you open the link first.
5. After Render gives you your address (step 2 below), open **Authentication > URL Configuration**. Set **Site URL** to your Render address, and add it to **Redirect URLs**. Password-reset and confirmation emails use this.
6. Optional but recommended once your own account exists: turn off **Allow new users to sign up** (Authentication > Sign In / Providers) so nobody else can register.

## 2. Deploy on Render

1. Put this folder in a GitHub repository (`.env` and `node_modules` are already ignored).
2. On render.com choose **New > Blueprint** and select the repository. `render.yaml` fills in the settings. (Or **New > Web Service** with build command `npm install` and start command `npm start`.)
3. When asked, enter `SUPABASE_URL` and `SUPABASE_ANON_KEY` from step 1.
4. Open the address Render gives you, create your account, and your plan is created automatically. The first Tuesday on or after today becomes week 1; change it in **Settings**.

Free plans have limits that change over time, so check Render's and Supabase's current pricing pages. At the time of writing, a free Render service goes to sleep when idle and takes up to a minute to wake (the app shows a "Waking up the server" message), and a free Supabase project can pause after a long period of no use; you restore it from the dashboard.

## 3. Run it on your computer

```bash
npm install
cp .env.example .env     # then fill in SUPABASE_URL and SUPABASE_ANON_KEY
npm start                # http://localhost:3000
```

To try the screens with no Supabase project at all (data lives in memory and disappears when you stop it; any email and password work):

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
src/                 API (Express): auth check, routes, date and calendar helpers
db/schema.sql        tables, security rules and functions for Supabase
data/                the starting plan, ideas, routine, checklist and playbook
public/              the web app (HTML, CSS, JavaScript modules)
test/                API tests and an in-memory Supabase for local trials
```
