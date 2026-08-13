# Hub — trip archive

A personal archive of past trips and a place to plan upcoming ones. React + Vite,
Tailwind, Supabase, deployed on Vercel.

---

## Setup

### 1. GitHub

1. github.com → **New repository**
2. Name it `hub`, set it to **Private**, don't add a README or .gitignore
   (the files below include both)
3. On the empty repo page, click **uploading an existing file**
4. Drag in every file and folder from this bundle, keeping the structure:

```
.env.example
.gitignore
index.html
package.json
postcss.config.js
README.md
tailwind.config.js
vite.config.js
public/icon-192.png
public/icon-512.png
public/manifest.json
src/App.jsx
src/helpers.js
src/index.css
src/main.jsx
src/supabase.js
```

The `src/` and `public/` folders must exist as folders — if you drag the folders
themselves rather than the loose files, GitHub keeps the structure automatically.

5. **Commit changes**

Case matters: `src/App.jsx` with a capital A. Vercel builds on Linux, which is
case-sensitive, so `app.jsx` will fail there even though it works on a Mac.

### 2. Supabase — allow the new site to sign you in

1. Supabase dashboard → your `itineraries` project → **Authentication** → **URL Configuration**
2. Leave this for now; you'll come back once Vercel gives you a domain.

### 3. Vercel

1. vercel.com → **Add New** → **Project**
2. **Import** the `hub` repo
3. Framework preset should auto-detect **Vite**. Leave the build settings alone.
4. Expand **Environment Variables** and add both:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public key |

   These must be set **before** the first deploy — Vite bakes them into the
   bundle at build time, so adding them later needs a redeploy.

5. **Deploy**. Takes about a minute.

### 4. Back to Supabase

Copy the URL under **Domains** (something like `hub-xyz.vercel.app`) — not the
deployment-specific one, which changes on every push.

Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** `https://your-domain.vercel.app`
- **Redirect URLs:** `https://your-domain.vercel.app/**`

Save. Sign-in links won't work until this is done.

### 5. Sign in

Open the site, enter the same email you used to create the Supabase user, and
click the link in the email. Your trips should appear.

### 6. Add to your iPhone home screen

1. Open the site in **Safari** (not Chrome — only Safari can install PWAs)
2. Share button → **Add to Home Screen** → **Add**
3. Launch from the icon; it runs fullscreen and stays signed in

---

## Making changes

Edit files directly in the GitHub web editor: open the file, click the pencil,
paste the new version, commit. Vercel redeploys in about 30 seconds.

---

## How things work

**Google Maps links.** Item titles are tappable. If the item has a `maps_url`
(from pasting a Maps share) that link is used; otherwise the app builds a search
URL from the place name plus the day's city or the trip's city. `Dinner @ Kink`
searches for `Kink Berlin` — the prefix before `@` is stripped.

**Upcoming vs archive** is derived from `start_date`, not stored. A trip moves
into the archive by itself the day it starts. Past trips with no entries show a
"not filled in" marker.

**The day editor** takes bullets. Enter starts the next one, Tab nests it,
Shift+Tab outdents, and the ⇤ ⇥ buttons do the same on mobile. Saving replaces
that day's items, so it round-trips: what you see is what gets re-parsed.

Line format, all parts optional:

```
- Dinner @ Kink, 8.30PM - great, would go back
  - sub-bullet
- Jolesch https://maps.app.goo.gl/xyz
```

A time is only picked up after a comma, so `Hyrox until 1pm` stays as written.

**Countries** are stored semicolon-separated (`Peru; Bolivia`) so the stats page
counts multi-country trips properly.
