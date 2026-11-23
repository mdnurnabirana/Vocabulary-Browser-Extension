# IELTS Lookup 2.1 — migration and update guide

## Before you reload the new version (important)

Version 2.1 adds a fixed `key` to `manifest.json` so the unpacked extension keeps
one permanent ID even if you move its folder. Adding the key changes the ID **once**,
so the old extension cannot see its existing history afterward.

1. Open the **currently installed 2.0 popup**.
2. Go to **History → Export CSV** and save the file.
3. Replace the files in this folder with the 2.1 files.
4. In `chrome://extensions`, click **Reload** on the extension card once.
5. Open the new popup → **History → Import** → choose the CSV or JSON file.
6. Check that the word count matches.

If you prefer a full-fidelity JSON snapshot, open this URL under the **old**
extension ID (shown on `chrome://extensions`) **before** reloading:

```
chrome-extension://<old-id>/legacy-export.html
```

That page reads the old storage and downloads JSON/CSV. It only works while the
old ID is still installed; after the reload the old ID is gone.

If you already reloaded without exporting, the old storage is no longer reachable
from the new ID. Restore from the CSV you exported, or from a daily JSON backup.

## Your normal update routine from now on

1. Replace the files in the same folder.
2. Click **Reload** on the existing extension card.
3. Never click **Remove** unless you intend to restore from a backup.

Do **not** remove/re-add the extension for routine updates. `chrome.storage.local`
survives Reload and normal version updates.

## Backup layers

- **Local storage**: primary history store.
- **Chrome Sync mirror**: compact copy of the newest 300 words, restored only when
  local history is empty and was not intentionally cleared.
- **Daily JSON backup**: `Downloads/IELTS-Lookup/ielts-history-backup.json`,
  overwritten daily. Toggle it in Settings.
- **Manual export**: JSON (full fidelity) and CSV, from the History tab.
- **Undo clear**: clearing history keeps one trash snapshot for the Undo button.

## Private key

The manifest `key` is the **public** key. The matching private key is kept outside
this extension folder:

```
C:\Users\mdnur\.ielts-lookup\private-key.pem
```

Keep it safe if you ever want to pack a `.crx` with the same extension ID.
