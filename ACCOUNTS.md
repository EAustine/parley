# Account setup

Everything Phase 1 needs. Roughly 25 minutes.

**Order matters.** Supabase generates the callback URL that Google needs, and Google generates the client credentials that Supabase needs. Doing it out of order means going back.

Dashboard labels move. Where a label here doesn't match what you see, go by function — the underlying concepts have been stable for years.

---

## Before you start

Open your password manager. Three things need storing that are not in `.env.local`: the Supabase database password, the Supabase access token, and the Google OAuth client secret.

Never paste any of these into a chat, an issue, a commit, or a screenshot.

---

## 1. LiveKit Cloud

1. Sign up at **cloud.livekit.io**.
2. Create a project. For users in Accra, pick the closest region — London or Frankfurt. LiveKit routes globally, so this sets the primary, not a limit.
3. **Settings → Keys.** A default key pair exists. Reveal the secret.
4. Copy three values:
   - Project URL — looks like `wss://parley-a1b2c3d4.livekit.cloud`
   - API key — starts `API`
   - API secret — a long random string
5. **Set a usage alert now.** Billing → Usage. Egress bandwidth is the bill in this product, and an alert at a threshold you'd notice is a five-minute job that prevents a bad surprise.

Webhooks are Phase 8. Skip that screen.

---

## 2. Supabase

1. **supabase.com/dashboard → New project.**
2. Name it, pick an organisation, and set a **database password**. This is a real password you will need for migrations — store it in your password manager now, not later. Supabase will not show it again.
3. Region: **West EU (London)** is the closest to Accra. Frankfurt is the next best.
4. Wait for provisioning, roughly two minutes.

### Get the API keys

**Project Settings → API.** You need three values:

- **Project URL** — `https://<ref>.supabase.co`
- **Publishable / anon key** — safe in client code, this is the one that ships in the browser bundle
- **Secret / service_role key** — server only, never in a `NEXT_PUBLIC_` variable

Depending on when the project was created you'll see either the legacy pair (`anon` and `service_role`, both long JWTs starting `eyJ`) or the newer pair (`sb_publishable_…` and `sb_secret_…`). Either works. Take whichever your dashboard shows, and keep them in the same roles — publishable/anon is the public one.

The `<ref>` in the project URL is your project reference. You'll need it again in a moment.

### Deployment Protection — turn it off, or the product does not work

**Vercel enables Standard Protection by default on new deployments**, which bounces any visitor who is not a Vercel user with access to the project to a Vercel login page. Its scope exempts production *custom* domains — a generated `*.vercel.app` URL is inside the protected set.

The failure is invisible to whoever built the project, because they are signed into Vercel. Everyone else — every guest, which is the highest-traffic flow in this product — hits a login wall for a service they have never heard of.

**Project → Settings → Deployment Protection → Vercel Authentication → Disabled.** Or add a custom domain, which removes the problem structurally rather than by toggle.

Verify from a device that has never signed into Vercel or Parley, in a private window, opening a real `/j/[code]` link. Not your own laptop with the session cleared.

### Configure auth URLs

**Authentication → URL Configuration:**

- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/**`

Add the production URL later, when there is one. Auth will silently fail to redirect if the URL isn't on this list, and the error is unhelpful.

### Email provider

**Authentication → Providers → Email.** Magic link is on by default. Leave it.

Supabase's built-in email sender is rate-limited to a handful per hour and is fine for development. Production needs a real SMTP provider — that's a Phase 10 concern, not now.

### Google provider — get the callback URL

**Authentication → Providers → Google.** Don't enable it yet. Copy the **Callback URL** it shows you:

```
https://<ref>.supabase.co/auth/v1/callback
```

Leave this tab open. You'll come back to it.

### Access token for the CLI

Phase 1 runs migrations, which needs the CLI authenticated.

**Account settings → Access Tokens → Generate new token.** Store it in your password manager. You'll use it once:

```bash
npx supabase login          # paste the token when prompted
npx supabase link --project-ref <ref>   # asks for the database password
```

---

## 3. Google Cloud

1. **console.cloud.google.com** → create a new project.
2. **APIs & Services → OAuth consent screen** (recent consoles brand this "Google Auth Platform"). Choose **External**.
3. Fill in app name, user support email, and developer contact email. Nothing else is required.
4. Scopes: leave the defaults. You only need `email`, `profile`, and `openid` — do not add anything else, because extra scopes trigger Google's verification review and you don't need it.
5. Test users: add your own email address. While the app is in Testing mode only listed users can sign in, which is correct for now.
6. **Credentials → Create credentials → OAuth client ID → Web application.**
7. **Authorized redirect URIs** — paste the Supabase callback URL from the previous step. This is the one field people get wrong; it must match exactly, including `https://` and the trailing path.
8. Create. Copy the **Client ID** and **Client secret**.

### Back to Supabase

Return to **Authentication → Providers → Google**, paste the Client ID and Client secret, and enable it. Save.

---

## 4. Fill `.env.local`

Copy `.env.example` to `.env.local` and fill in the seven values. `.env.local` is gitignored — confirm that before your first commit.

```bash
cp .env.example .env.local
git check-ignore -v .env.local     # should print a .gitignore match
```

Then verify:

```bash
npm run check:env
```

This parses and validates every variable and refuses to pass if a secret has landed in a public one. Run it before `npm run dev`.

---

## Who runs what

Three buckets. The dividing line is secrets: anything that touches one is yours.

### Browser only — no terminal

All of sections 1, 2, and 3 above. LiveKit signup and keys, Supabase project and auth config, Google Cloud consent screen and OAuth client. Nothing here has a command-line equivalent worth using.

### Your terminal — because secrets pass through

```bash
cp .env.example .env.local
```

Then **open `.env.local` in your editor** and paste the seven values. Not through Claude Code — anything it reads enters its context.

```bash
npx supabase login                       # paste the access token when prompted
npx supabase link --project-ref <ref>    # prompts for the database password
npm run check:env                        # confirm before handing back
```

Both `supabase` commands are interactive and expect a secret at a prompt. `check:env` prints variable names and pass/fail only, never values — run it yourself once so you know the state before delegating.

### Claude Code's terminal — everything else

Scaffold placement, `package.json` scripts, `.gitignore`, migrations, SQL, RLS policies, installs, builds, the dev server. None of it needs a secret in the clear; the Supabase CLI reads the link you already authorised.

Hand off with something like:

> `.env.local` is filled and `npm run check:env` passes. The `scaffold/` folder is in the project root — move `.env.example` and `lib/env.ts` into place, `check-env.mjs` into `scripts/`, add the `check:env` and `predev` scripts to `package.json`, then start Phase 1.

Do not paste any value into that message. Claude Code needs to know the environment is *configured*, not what it contains.

---

## What goes where

| Value | Variable | Exposure |
|---|---|---|
| LiveKit project URL | `NEXT_PUBLIC_LIVEKIT_URL` | public — the browser connects to it |
| LiveKit API key | `LIVEKIT_API_KEY` | server only |
| LiveKit API secret | `LIVEKIT_API_SECRET` | **server only — signs room tokens** |
| Supabase project URL | `NEXT_PUBLIC_SUPABASE_URL` | public |
| Supabase publishable/anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public — safe by design, RLS enforces access |
| Supabase secret/service_role key | `SUPABASE_SERVICE_ROLE_KEY` | **server only — bypasses RLS entirely** |
| App URL | `NEXT_PUBLIC_APP_URL` | public |

Google's client ID and secret live in the Supabase dashboard, not in `.env.local`. The app never sees them.

The two marked in bold are the ones that matter. `LIVEKIT_API_SECRET` lets anyone mint a token for any room. `SUPABASE_SERVICE_ROLE_KEY` reads and writes every row in the database regardless of RLS. Anything prefixed `NEXT_PUBLIC_` is compiled into the JavaScript bundle and is readable by anyone who opens devtools — which is why `lib/env.ts` refuses to boot if either lands there.

---

## If something doesn't work

**Magic link opens and immediately signs out** — the redirect URL isn't in Supabase's allow list. Check for a trailing slash mismatch.

**Google sign-in returns `redirect_uri_mismatch`** — the URI in Google Cloud doesn't exactly match Supabase's callback. Compare character by character.

**Google sign-in returns "access blocked"** — you're in Testing mode and the account isn't on the test user list.

**LiveKit connection fails with an auth error** — the API key and secret belong to a different project than the WS URL. All three come from one project.

**Supabase CLI link fails** — that prompt wants the database password from step 2, not your account password.
