# Cadence

A build-free task app: plain HTML, CSS and JavaScript files. No bundler, no npm install.

- **Tasks**: natural-language quick add, inventory summary, filters, grouping, agenda and table layouts, swipe gestures on phones
- **Calendar**: month and week views; drag tasks between days or onto "Unscheduled"
- **Settings**: task types (name, color, icon, order), importance levels (name, color, rank, default), theme, week start, backup and restore

## Run it

Open `index.html` in a browser, or serve the folder:

```sh
npx serve .            # or: python3 -m http.server 8080
```

With no Firebase config, tasks are saved in that browser's local storage.

## Quick-add syntax

| Type this            | You get                                  |
|----------------------|------------------------------------------|
| `tomorrow`, `fri`, `next week`, `in 3 days`, `oct 14`, `10/14` | due date |
| `3pm`, `9:30am`, `15:00`, `noon`, `tonight` | time (a time alone means today) |
| `#work`              | task type (prefix match on the name)     |
| `!high`, `!1`, `!!`  | importance (`!1` / `!!` = top level)     |
| `every week`, `daily`, `every weekday`, `monthly` | repeat |

## Keyboard

`N` new task · `/` search · `⌘K` / `Ctrl K` command menu · `1` `2` `3` switch pages · `←` `→` move the calendar · `T` today · `D` dark mode · `X` complete focused task · `⌘↵` save in the editor

## Turn on sign-in and sync (Firebase)

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method**: enable **Google** and/or **Email/Password**.
3. **Firestore Database → Create database** (production mode).
4. **Project settings → Your apps → Web app (`</>`)**: register an app and copy its config object into `js/firebase-config.js`.
5. **Authentication → Settings → Authorized domains**: add the domain you'll host on (`localhost` is there by default).
6. Deploy the rules (and optionally host the app):

```sh
npm i -g firebase-tools
firebase login
firebase use --add                 # pick your project
firebase deploy --only firestore:rules
firebase deploy --only hosting     # optional: hosts this folder
```

Once configured, the app shows a sign-in screen and every user gets a private space:

```
users/{uid}/items/settings   types, importance levels, defaults
users/{uid}/items/{taskId}   one document per task
```

`firestore.rules` lets a signed-in user read and write only their own `users/{uid}/…` documents, validates the shape and size of every task and settings write, and denies all other paths. To require verified email addresses, swap in the commented `isOwner` variant in the rules file.

The Firebase web config values are public identifiers, not secrets. Access control comes from the rules. For extra protection against abuse, turn on **App Check** in the console.

If a user had tasks in the browser before signing in for the first time, they are uploaded to that user's new, empty account. A different account signing in on the same browser starts fresh. Signing out clears the local copy.

## Files

```
index.html
css/tokens.css          color, type and spacing tokens (light + dark)
css/app.css             layout and components
js/icons.js             inline SVG icons
js/utils.js             dates, formatting, quick-add parser, recurrence
js/store.js             state, local cache, sync engine
js/firebase-config.js   your Firebase config (empty = local only)
js/firebase-sync.js     sign-in screen + Firestore connection
js/ui/                  toast, drag & drop, task editor, command menu
js/views/               tasks, calendar, settings pages
js/app.js               app shell, routing, shortcuts
firestore.rules         Firestore security rules
firebase.json           Firebase CLI config (rules + hosting)
```
