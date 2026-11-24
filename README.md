# IELTS Lookup

A lightweight, open-source bilingual dictionary for IELTS study. Select a word on
any page and a compact card appears with its Bangla meaning and English
dictionary definitions — without leaving the page or opening a new tab.

The extension is distributed as source only. There is no build step, no account,
no telemetry, and no browser-store listing; you load it as a private unpacked
extension.

## Features

- **Bilingual lookup card** — word, pronunciation, Bangla equivalents, and
  English definitions grouped by part of speech.
- **Dictionary fallback chain** — Oxford Learner's Dictionaries, then Cambridge,
  then the Free Dictionary API.
- **Study aids** — UK/US IPA, examples, synonyms, and antonyms.
- **Popup lookup** — the same result view is available from the toolbar popup.
- **History** — every lookup is saved locally with its meaning, count,
  first-seen date, and star. Search, sort, replay, delete, or clear with Undo.
- **Durable storage** — history survives Reload and normal unpacked updates,
  with a Chrome Sync mirror, daily JSON backups, and manual JSON/CSV import and
  export.
- **Comfortable UI** — light/dark/auto themes, three text sizes, adjustable card
  width, and bundled Inter and Noto Sans Bengali fonts.
- **Keyboard shortcut** — `Alt+Shift+D` looks up the current selection immediately.

## Requirements

- Google Chrome, Microsoft Edge, Brave, or another Chromium-based browser with
  Manifest V3 support (Chrome 88+ / Edge 88+).
- An internet connection for dictionary and translation lookups.

Firefox is not supported: the extension uses a Manifest V3 background service
worker and Chromium's `chrome.*` extension APIs.

## Install (unpacked / private use)

1. Download or clone this repository:

   ```sh
   git clone https://github.com/mdnurnabirana/Vocabulary-Browser-Extension.git
   ```

2. Open your browser's extension manager:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the repository folder (the one containing
   `manifest.json`).
5. Pin **IELTS Lookup** to the toolbar if you want quick access.

The `key` in `manifest.json` keeps the extension ID stable at:

```
mmbjaihepknkcajlbgehphbhadgnakee
```

Keep the folder at a stable path. If you move it, read
[Updating and backups](#updating-and-backups) first.

## Usage

- **Look up a word:** select a word or short phrase on any web page. The card
  appears after a short delay.
- **Skip the delay:** press `Alt+Shift+D` after selecting text, or use the
  shortcut shown in `chrome://extensions/shortcuts`.
- **Popup:** click the toolbar icon to search a word manually, browse history,
  or change settings.
- **Dismiss:** press `Esc` or click outside the card.

## Updating and backups

Replace the files in the extension folder with the new version, then click
**Reload** on the extension card in `chrome://extensions`.

Do **not** click **Remove** for routine updates. `chrome.storage.local` and the
Chrome Sync mirror survive Reload, but Remove deletes local history.

History is protected by several layers:

| Layer | What it covers |
| --- | --- |
| `chrome.storage.local` | Primary history store |
| Chrome Sync mirror | Newest 300 words, restored only when local history is empty and was not intentionally cleared |
| Daily JSON download | `Downloads/IELTS-Lookup/ielts-history-backup.json`, overwritten daily |
| Manual export | Full-fidelity JSON and spreadsheet-friendly CSV |
| Undo clear | One deleted-history snapshot kept until the next clear |

JSON preserves counts, stars, first-seen dates, and bilingual fields. CSV is for
reading in a spreadsheet and for importing the old 2.0 export.

Upgrading from version 2.0 requires a one-time export because 2.1 introduces the
fixed manifest key. See [MIGRATION.md](MIGRATION.md) for the exact steps.

## Privacy

- History stays in your browser. There is no account, no analytics, and no
  developer-operated server.
- A lookup sends the selected word to Google Translate and to the dictionary
  sites listed in `manifest.json`. Requests are made from the background service
  worker, not from the page you are reading.
- The content script only reacts to text you select. It does not read or modify
  the rest of the page and does not change the host page's styles.
- The `downloads` permission is used only for the optional daily JSON backup.
- The `storage` and `unlimitedStorage` permissions keep history and settings
  local; `alarms` schedules the daily backup and cache cleanup.

## Permissions explained

| Permission | Why it is needed |
| --- | --- |
| `storage`, `unlimitedStorage` | Save settings, cache, history, and the sync mirror |
| `downloads` | Write the optional daily JSON backup |
| `alarms` | Schedule daily backups and cache maintenance |
| `translate.googleapis.com` | Fetch Bangla equivalents |
| `api.dictionaryapi.dev` | Free Dictionary API fallback |
| `api.datamuse.com` | Synonyms and antonyms |
| `dictionary.cambridge.org`, `www.oxfordlearnersdictionaries.com` | English definitions and examples |
| `<all_urls>` content script | Detect text selection on any page you visit |

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

There is no bundler, package install, or compile step. Edit the plain scripts,
then reload the extension from `chrome://extensions`.

Syntax-check every script with Node.js:

```sh
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

To debug the background worker, open `chrome://extensions`, click **service
worker** on the extension card, and use the DevTools console. Content-script logs
appear in the page's own DevTools console.

## Contributing

Issues and pull requests are welcome.

1. Fork the repository and create a branch from `main`.
2. Keep changes focused and consistent with the existing plain-JavaScript style.
3. Run the syntax checks above before opening a pull request.
4. Describe the user-visible change and how you tested it in the browser.

Please do not commit personal history exports, `.pem` keys, `.crx` packages, or
other local files; `.gitignore` already covers the common cases.

## Disclaimer

This is an unofficial study tool. It is not affiliated with IELTS, Oxford
University Press, Cambridge University Press, Google, or DictionaryAPI.dev.
Dictionary content belongs to its respective owners. The extension fetches pages
for personal study; respect the terms of service and rate limits of the sites
involved, and do not use it for bulk scraping or redistribution.

## License

Released under the [MIT License](LICENSE).
