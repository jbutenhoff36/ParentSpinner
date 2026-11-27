# KidSpin

A family behavior app: parents log good days, kids earn spins on the Good wheel,
parents can spin the Bad and Fighting wheels, and every result lands on the
child's "Earned" list. Moved off Replit; runs anywhere with Node and Postgres.

## Run it on your own computer

You need Node.js 20.12 or newer and a Postgres database (a free hosted one from
Neon or Supabase works, or a local Postgres install).

```bash
npm install
cp .env.example .env        # then put your DATABASE_URL and a SESSION_SECRET in .env
npm run dev                 # creates the tables on first start, then serves                # http://localhost:5000
```

Phones on the same Wi-Fi can open `http://<your-computer's-IP>:5000`.

## Put it online

The app's name is set in `client/src/lib/brand.ts` (plus the page title in
`client/index.html` and `public/manifest.webmanifest`).

The app is one Node server plus one Postgres database. Any host that runs Node works.

**Database: Neon (free).** Neon's free Postgres doesn't expire. It pauses when nobody
is using the app and wakes up in about a second on the next visit.

1. Go to https://neon.tech and click **Sign up**, then **Continue with GitHub**.
2. Create a project: any name (e.g. `kidspin`), Postgres version as suggested, and a
   region near your host (for Render's default Oregon region pick **AWS US West (Oregon)**).
3. On the project dashboard click **Connect**, and copy the connection string. It looks like
   `postgresql://neondb_owner:...@ep-....us-west-2.aws.neon.tech/neondb?sslmode=require`.
   That is your `DATABASE_URL`. The app creates its tables on first start.

**Render (web app, free):** on render.com choose New > Blueprint and pick this repo.
`render.yaml` creates the `kidspin` web service and fills in `SESSION_SECRET`. Then open
the service, go to **Environment**, add `DATABASE_URL` (from Neon) plus the Google keys
below, and save. The free plan sleeps after 15 minutes idle, so the first visit after a
break takes about a minute.

**Railway / Fly.io / any VPS:** set these environment variables, then run
`npm ci --include=dev && npm run build` to build and `npm start` to run (the server creates
and updates its tables on start):

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_SSL` | `true` if your host needs SSL without a CA file |
| `SESSION_SECRET` | Long random string (required in production) |
| `APP_TIMEZONE` | e.g. `America/Chicago`, used for "one good day per day" |
| `PORT` | Usually set by the host |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. Turns on "Continue with Google" (see below) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional. Keys for phone notifications. If unset, the app makes a pair and keeps it in the database |
| `VITE_SUPPORT_EMAIL` | Optional. Contact email shown on /privacy and /terms (used at build time, so redeploy after setting it) |
| `APP_URL` | Optional. Public address, e.g. `https://spin.example.com`, if Google sign-in builds the wrong return link |

In production, login cookies are HTTPS-only. If you serve over plain HTTP (for example
on a home network), also set `COOKIE_SECURE=false`.

## Turn on Sign in with Google

The button only appears once both Google settings are filled in.

1. Go to https://console.cloud.google.com and create a project (any name).
2. Open **Google Auth Platform** (older screens call it "APIs & Services > OAuth consent screen")
   and click **Get started**. Enter the app name and your email, choose **External**, and finish.
3. Under **Audience**, click **Publish app** so anyone can sign in, not only test users.
   The basic email and profile access this app uses doesn't need Google's review.
4. Under **Clients**, click **Create client**, choose **Web application**, and under
   **Authorized redirect URIs** add your address followed by `/api/auth/google/callback`, e.g.
   `https://kidspin.onrender.com/api/auth/google/callback`.
   Add one for each address you use (for example a custom domain later).
   Under **Branding**, use app name KidSpin, the logo from `public/icon-512.png` (or a 120x120 copy),
   home page `https://<your address>/`, privacy policy `https://<your address>/privacy`,
   terms `https://<your address>/terms`, and authorized domain `onrender.com` (or your own domain).
5. Copy the **Client ID** and **Client secret**. In Render, open the web service,
   go to **Environment**, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and save.
   Render redeploys and the button appears.

People who sign in with Google for the first time choose "I'm a parent" (start a new family,
or join one with a family invite code) or "I'm a kid" (enters the kid code). A parent who already has a username can link
Google under Setup > Your account.

## How it works

- Logins are cookie sessions stored in Postgres, so restarts don't log anyone out.
  Every API route except register, login, logout and parent-code lookup requires login.
- Passwords are hashed (scrypt). Old plain-text passwords are upgraded on next login.
- Each family (a parent and their linked children) only sees its own children,
  wheels, earned list, settings and spin requests.
- The server picks every spin result; the wheel just animates to it.
- Good spins need an earned spin. A parent's accepted Good spin uses one right away;
  a child's request uses one only when the parent approves (rejecting keeps it).
  Bad and Fighting spins never need one, and only parents can start them.
- A child gets one result per earned spin (spinning again before sending shows the same result).
- Good days are limited to one per child per calendar day. Parents can log a missed day
  from the last two weeks, or remove one logged by mistake, from the week strip on Home.
- Every full set of good days turns into a spin, whether it came from logging days,
  adjusting the counts, or lowering the goal. Leftover days carry over.
- Real-time notifications identify the user from their login session.

## Scripts

`npm run dev` (dev server with hot reload), `npm run build`, `npm start`,
`npm run check` (TypeScript), `npm run db:generate` (make a new migration after
changing `shared/schema.ts`; it runs automatically on the next start).

## More parents and guardians

A family can have any number of parents, grandparents, or guardians. Under **Setup > Family**
any parent can copy the 8-character family invite code. The new person signs up, picks
"I'm a parent", then **Join a family**, and enters the code. Every parent sees the same kids,
wheels, and approvals. Parents can be removed there too, and the code can be changed at any time
(old codes stop working). The kid code is separate and only lets kids sign in.

## Phone notifications

Each person turns them on under **Setup > Your account > Notifications** (or from the prompt on
Home). Parents hear about good days, earned spins, and spin requests; kids hear about earned
spins, new chores or rewards, and approvals.

- Android and computers: works in Chrome, Edge, and Firefox right away.
- iPhone and iPad (iOS 16.4 or newer): open the site in Safari, tap Share, then
  **Add to Home Screen**, open KidSpin from the Home Screen, and turn notifications on there.
