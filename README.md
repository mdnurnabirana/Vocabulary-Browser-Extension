# IELTS Lookup

A private, unpacked Chrome extension for IELTS vocabulary study. Select a word on
any page and a compact card appears with its Bangla equivalents and the English
dictionary explanation, without leaving the page.

## What it does

- **Bilingual card** — word, pronunciation, Bangla equivalents, then English
  definitions grouped by part of speech.
- **Dictionary fallback** — Oxford Learner's Dictionaries, then Cambridge, then
  the Free Dictionary API.
- **Study aids** — UK/US IPA, examples, synonyms, and antonyms.
- **Popup lookup** — the same result view works from the toolbar popup.
- **History** — every lookup is saved locally with its meaning, count, first-seen
  date, and star. Search, sort, replay, delete, or clear with Undo.
- **Durable storage** — history survives Reload and normal unpacked updates,
  with a Chrome Sync mirror, daily JSON backups, and manual JSON/CSV import and
  export.
- **Comfortable UI** — light/dark/auto themes, three text sizes, adjustable card
  width, bundled Inter and Noto Sans Bengali fonts.

No build step, no React, and no external UI framework.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Pin the extension if you want quick access.

The `key` in `manifest.json` pins the extension ID to:

```
mmbjaihepknkcajlbgehphbhadgnakee
```

Keep the folder at a stable path. Moving it is fine; removing and re-adding it
creates a fresh extension profile and erases local history.

## Updating without losing history

1. Replace the files in this folder with the new version.
2. Click **Reload** on the existing extension card.
3. Do **not** click **Remove** for routine updates. `chrome.storage.local` and
   the sync mirror survive Reload, but Remove deletes them.

The one-time move from 2.0 to 2.1 changes the extension ID because 2.1 adds the
fixed key. Export your old history **before** reloading. See
[MIGRATION.md](MIGRATION.md) for the exact steps.

## Backups

History is kept in several layers:

| Layer | What it covers |
| --- | --- |
| `chrome.storage.local` | Primary history store |
| Chrome Sync mirror | Newest 300 words, restored only when local history is empty and was not intentionally cleared |
| Daily JSON download | `Downloads/IELTS-Lookup/ielts-history-backup.json`, overwritten daily |
| Manual export | Full-fidelity JSON and spreadsheet-friendly CSV |
| Undo clear | One deleted-history snapshot kept until the next clear |

JSON preserves counts, stars, first-seen dates, and bilingual fields. CSV is for
reading in a spreadsheet and for importing the old 2.0 export.

## Privacy

- History stays in your browser. There is no account and no analytics.
- A lookup sends the selected word to Google Translate and to the dictionary
  sites listed in `manifest.json`, through the background service worker.
- The content script only reacts to text you select. It does not read the page
  otherwise and does not change the host page's styles.

## Project layout

| File | Responsibility |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, stable key, content scripts |
| `shared.js` | Schema, defaults, part-of-speech aliases, normalization |
| `styles.js` | Design tokens and shared card/popup components |
| `core.js` | Settings, messaging, storage helpers, cache, DOM helpers |
| `api.js` | Translation and dictionary parsers |
| `render.js` | Bilingual grouping and result rendering |
| `content.js` | Selection watcher and on-page card |
| `background.js` | Serialized history writes, fetch proxy, sync mirror, alarms, backups |
| `popup.html` / `popup.js` | Toolbar popup: lookup, history, settings |
| `legacy-export.html` / `legacy-export.js` | One-time 2.0 export page |
| `MIGRATION.md` | Upgrade and backup instructions |
| `fonts/`, `icons/` | Bundled local assets |

## Development

There is no bundler or package install. Edit the plain scripts and reload the
extension from `chrome://extensions`.

```powershell
node --check background.js
node --check content.js
node --check core.js
node --check api.js
node --check render.js
node --check shared.js
node --check styles.js
node --check popup.js
node --check legacy-export.js
```

Useful places to start:

- Dictionary parsing and fallback order: `api.js`
- Card layout and bilingual grouping: `render.js`
- History serialization and backup policy: `background.js`
- Settings and popup tabs: `popup.js`

## Repository conventions

Commits use a short prefix such as `init:`, `feat:`, `fix:`, or `docs:`, and each
commit carries a `Co-authored-by` trailer. Work lands on `main` through a
`--no-ff` merge.

This is a personal project and is not published to the Chrome Web Store.
