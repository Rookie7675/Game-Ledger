# Installing The Quartermaster's Ledger on Android

## The honest version of how this works

Android Chrome can install a website as a real app — its own icon, its own
window, no address bar, works offline — **but only if that website is served
over HTTPS.** A file sitting in your phone's folders (`file://`) doesn't
qualify, no matter how the manifest is set up; that's a browser security
rule, not something any code change can get around.

The good news: you don't need the Play Store, an Android build, or any
signing keys. Once these files are hosted anywhere with HTTPS, Chrome does
all the app-packaging invisibly the moment you tap "Install."

So there's one small step before you get your icon: **put these files
somewhere with a `https://` address.** Two free ways to do that, easiest
first.

---

## Option A — Netlify Drop (fastest, no account, ~2 minutes)

1. On a computer, go to **app.netlify.com/drop**
2. Drag the whole `guild-ledger-files` folder onto the page
3. Netlify gives you a `https://random-name.netlify.app` URL instantly
4. Open that URL on your Android phone in Chrome

Downside: without a free Netlify account attached, that link can expire
after a while. Fine for testing; if it becomes your daily tool, do Option B
so it doesn't disappear on you.

## Option B — GitHub Pages (free, permanent, ~10 minutes once)

1. Create a free account at **github.com** if you don't have one
2. Click **New repository** — name it something like `guild-ledger` — set
   it to **Public** — create it
3. Click **Add file → Upload files**, then drag in every file from the
   `guild-ledger-files` folder (all the `.html`, `.css`, `.js`, `.json`,
   and `.png` files) — commit the upload
4. Go to the repo's **Settings → Pages**
5. Under "Build and deployment," set **Source: Deploy from a branch**,
   **Branch: main**, folder **/ (root)** — Save
6. Wait about a minute, then your app is live at:
   `https://YOUR-USERNAME.github.io/guild-ledger/`

Whenever you want to update the app later (new features, fixes), just
upload the changed files again the same way.

---

## Installing it on your phone

1. Open your hosted `https://…` link in **Chrome** on Android
2. Tap the **⋮** menu → **Add to Home screen** / **Install app**
   (Chrome may also just pop this up on its own after a moment)
3. Confirm — you'll get a real icon on your home screen or app drawer
4. Tap it: it opens full-screen, no browser bar, and keeps working even
   with no signal once you've opened it that first time

---

## One thing that changes on a phone: the Save File feature

The **📂 Open Save File / ＋ New Save File** buttons (the ones that
auto-write to a file on disk as you go) only work on **desktop** Chrome,
Edge, or Opera — Android doesn't expose that capability to any browser, so
those buttons will stay hidden on your phone automatically.

What **does** work great on Android: **⬇ Export Backup** and
**⬆ Import Backup**. Export saves a real `.json` file straight to your
phone's Downloads (or wherever your phone saves downloads) — you can back
it up, move it, or open it on a computer later. Import reads one back in
and adds it to what's already there. Get in the habit of tapping Export
after a session, since nothing auto-saves without a linked file.

---

## About "using the game in the app"

Everything you already asked for — auto-calculating profit/ROI, capping
crafting by what's in storage, the Game Data reference list, the Best-To-
Sell breakdown, and storing materials — is already built in and works the
same on the phone as it did in a browser tab. That part didn't need
anything new.

If what you meant was closer to *automatically reading data straight out of
the Guild Master app itself* (so you'd never have to type numbers in) —
that's a different kind of thing entirely. It would need special
Android permissions to read another app's screen, likely isn't something
Guild Master supports or allows, and isn't something I can respons­ibly build
here. Let me know if that's actually what you were picturing, so I can be
straight with you about what's realistic instead of quietly building
something else.
