/* background.js: fetch proxy, single-writer history store, sync mirror, backups */
importScripts("shared.js");

const ALLOWED = new Set([
  "translate.googleapis.com",
  "api.dictionaryapi.dev",
  "api.datamuse.com",
  "dictionary.cambridge.org",
  "www.oxfordlearnersdictionaries.com",
]);
const CACHE_TTL = 45 * 86400000;
const MAX_CACHE = 2500;
const SYNC_LIMIT = 300;
let historyChain = Promise.resolve();
let lastMirrorAt = 0;

function serial(fn) {
  const run = historyChain.then(fn, fn);
  historyChain = run.catch(() => {});
  return run;
}

async function readHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  return normalizeHistoryList(history);
}

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

async function writeHistory(history, extra = {}) {
  await chrome.storage.local.set({
    history: normalizeHistoryList(history),
    ...extra,
  });
}

/* ---------- network proxy ---------- */
async function fetchOnce(url, as) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, status: response.status };
    const data = as === "json" ? await response.json() : await response.text();
    return { ok: true, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function proxyFetch(url, as) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED.has(parsed.hostname)) {
    throw new Error("blocked host");
  }
  try {
    return await fetchOnce(url, as);
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      return await fetchOnce(url, as);
    } catch {
      throw firstError;
    }
  }
}

/* ---------- history operations ---------- */
async function addEntry(entry) {
  const incoming = normalizeHistoryEntry(entry);
  if (!incoming) return { ok: false, error: "invalid word" };
  const history = await readHistory();
  const key = incoming.word.toLowerCase();
  const index = history.findIndex((item) => item.word.toLowerCase() === key);
  const old = index >= 0 ? history[index] : null;
  const merged = old
    ? normalizeHistoryEntry({
        ...old,
        ...incoming,
        word: incoming.word || old.word,
        meaning: incoming.meaning || old.meaning,
        translations: dedupe([
          ...(old.translations || []),
          ...(incoming.translations || []),
          ...(old.bangla || []),
          ...(incoming.bangla || []),
        ]),
        bangla: dedupe([...(old.bangla || []), ...(incoming.bangla || [])]),
        english: incoming.english || old.english,
        pos: incoming.pos || old.pos,
        source: incoming.source || old.source,
        tgt: incoming.tgt || old.tgt,
        ts: Date.now(),
        firstTs: old.firstTs || old.ts || Date.now(),
        count: (old.count || 0) + 1,
        starred: old.starred,
      })
    : normalizeHistoryEntry({
        ...incoming,
        ts: Date.now(),
        firstTs: Date.now(),
        count: 1,
      });
  if (index >= 0) history.splice(index, 1);
  history.unshift(merged);
  await writeHistory(history);
  const settings = await getSettings();
  await mirrorHistory(history, settings).catch(() => {});
  await maybeBackup(false).catch(() => {});
  return { ok: true, entry: merged };
}

async function removeEntry(word) {
  const key = normalizeWord(word).toLowerCase();
  const history = (await readHistory()).filter(
    (item) => item.word.toLowerCase() !== key,
  );
  await writeHistory(history);
  const settings = await getSettings();
  await mirrorHistory(history, settings, true).catch(() => {});
  return { ok: true, count: history.length };
}

async function starEntry(word, starred, seed) {
  const history = await readHistory();
  const key = normalizeWord(word).toLowerCase();
  const index = history.findIndex((item) => item.word.toLowerCase() === key);
  if (index >= 0) {
    history[index] = { ...history[index], starred: Boolean(starred) };
  } else if (starred) {
    const entry = normalizeHistoryEntry({
      ...(seed || {}),
      word,
      starred: true,
      ts: Date.now(),
      firstTs: Date.now(),
      count: seed?.count || 1,
    });
    if (entry) history.unshift(entry);
  }
  const normalized = normalizeHistoryList(history);
  await writeHistory(normalized);
  const settings = await getSettings();
  await mirrorHistory(normalized, settings, true).catch(() => {});
  const entry = normalized.find((item) => item.word.toLowerCase() === key) || null;
  return { ok: true, entry };
}

async function clearAll() {
  const history = await readHistory();
  await chrome.storage.local.set({
    "trash:history": { ts: Date.now(), entries: history },
    history: [],
    historyClearedAt: Date.now(),
  });
  await clearSyncMirror(Date.now()).catch(() => {});
  return { ok: true, count: history.length };
}

async function undoClear() {
  const { "trash:history": trash } = await chrome.storage.local.get("trash:history");
  if (!trash?.entries?.length) return { ok: false, error: "nothing to restore" };
  const history = normalizeHistoryList(trash.entries);
  await writeHistory(history);
  await chrome.storage.local.remove(["trash:history", "historyClearedAt"]);
  const settings = await getSettings();
  await mirrorHistory(history, settings, true).catch(() => {});
  return { ok: true, count: history.length };
}

async function importEntries(entries, mode) {
  const incoming = normalizeHistoryList(entries);
  if (!incoming.length) return { ok: false, error: "no valid words" };
  const current = await readHistory();
  let next;
  if (mode === "replace") {
    await chrome.storage.local.set({
      "trash:history": { ts: Date.now(), entries: current },
    });
    next = incoming;
  } else {
    next = mergeHistoryLists(current, incoming);
  }
  await writeHistory(next);
  const settings = await getSettings();
  await mirrorHistory(next, settings, true).catch(() => {});
  return { ok: true, count: next.length, imported: incoming.length };
}

async function historyStats() {
  const [bytes, local, syncData] = await Promise.all([
    chrome.storage.local.getBytesInUse(null).catch(() => 0),
    chrome.storage.local.get(["history", "backupMeta", "trash:history"]),
    chrome.storage.sync.get("sync:meta").catch(() => ({})),
  ]);
  const history = normalizeHistoryList(local.history || []);
  return {
    ok: true,
    count: history.length,
    starred: history.filter((entry) => entry.starred).length,
    bytes,
    backupMeta: local.backupMeta || null,
    trashCount: local["trash:history"]?.entries?.length || 0,
    syncCount: syncData?.["sync:meta"]?.count || 0,
  };
}

async function clearCache() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((key) => key.startsWith("c:"));
  if (keys.length) await chrome.storage.local.remove(keys);
  return { ok: true, count: keys.length };
}

/* ---------- sync mirror ---------- */
const SYNC_ITEM_BYTES = 7000;
const SYNC_DATA_BYTES = 64000;
const byteLength = (value) => new TextEncoder().encode(value).length;
const shorten = (value, max) => String(value || "").trim().slice(0, max);

async function syncSet(rows, settings) {
  const compact = rows
    .map((entry) => [
      shorten(entry.word, 80),
      shorten(entry.meaning, 140),
      shorten(entry.english, 180),
      shorten(entry.pos, 24),
      entry.ts,
      entry.count || 1,
      entry.starred ? 1 : 0,
      entry.tgt || "bn",
    ])
    .filter((row) => row[0]);

  const chunks = [];
  let current = [];
  let currentBytes = 2;
  let totalBytes = 2;
  let mirrored = 0;
  for (const row of compact) {
    const rowBytes = byteLength(JSON.stringify(row)) + 1;
    if (rowBytes > SYNC_ITEM_BYTES - 100) continue;
    if (current.length && currentBytes + rowBytes > SYNC_ITEM_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    if (totalBytes + rowBytes > SYNC_DATA_BYTES) break;
    current.push(row);
    currentBytes += rowBytes;
    totalBytes += rowBytes;
    mirrored += 1;
  }
  if (current.length) chunks.push(current);

  const items = {};
  chunks.forEach((chunk, index) => {
    items[`sync:h:${index}`] = chunk;
  });
  items["sync:meta"] = {
    v: 2,
    count: mirrored,
    ts: Date.now(),
    clearedAt: 0,
    n: chunks.length,
  };
  items["sync:settings"] = settings;

  const old = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set(items);
  const extra = Object.keys(old).filter((key) => {
    if (!key.startsWith("sync:h:")) return false;
    const index = Number(key.slice("sync:h:".length));
    return !Number.isFinite(index) || index >= chunks.length;
  });
  if (extra.length) await chrome.storage.sync.remove(extra);
  return mirrored;
}

async function mirrorHistory(history, settings, force = false) {
  if (settings.syncMirror === false) return;
  if (!force && Date.now() - lastMirrorAt < 30000) return;
  lastMirrorAt = Date.now();
  const rows = history.slice(0, SYNC_LIMIT);
  try {
    await syncSet(rows, settings);
  } catch {
    try {
      await syncSet(rows.slice(0, 100), settings);
    } catch {}
  }
}

async function mirrorSettings(settings) {
  if (settings.syncMirror === false) return;
  try {
    await chrome.storage.sync.set({ "sync:settings": settings });
  } catch {}
}

async function clearSyncMirror(now) {
  const old = await chrome.storage.sync.get(null);
  const chunks = Object.keys(old).filter((key) => key.startsWith("sync:h:"));
  if (chunks.length) await chrome.storage.sync.remove(chunks);
  await chrome.storage.sync.set({
    "sync:meta": { v: 2, count: 0, ts: now, clearedAt: now, n: 0 },
  });
}

async function restoreFromSync() {
  const local = await chrome.storage.local.get([
    "history",
    "historyClearedAt",
    "settings",
  ]);
  if (normalizeHistoryList(local.history || []).length) return false;
  const meta = (await chrome.storage.sync.get("sync:meta"))["sync:meta"];
  if (!meta?.count || !meta.n) return false;
  if ((local.historyClearedAt || 0) >= (meta.ts || 0)) return false;
  const keys = Array.from({ length: meta.n }, (_, index) => `sync:h:${index}`);
  const data = await chrome.storage.sync.get(keys);
  const rows = [];
  for (const key of keys) {
    if (Array.isArray(data[key])) rows.push(...data[key]);
  }
  const entries = rows
    .map((row) => ({
      word: row[0],
      meaning: row[1],
      english: row[2],
      pos: row[3],
      ts: row[4],
      count: row[5],
      starred: Boolean(row[6]),
      tgt: row[7] || "bn",
    }))
    .filter((entry) => entry.word);
  if (!entries.length) return false;
  await chrome.storage.local.set({
    history: normalizeHistoryList(entries),
    syncRestoredAt: Date.now(),
  });
  const syncedSettings = (await chrome.storage.sync.get("sync:settings"))[
    "sync:settings"
  ];
  if (!local.settings && syncedSettings) {
    await chrome.storage.local.set({ settings: syncedSettings });
  }
  return true;
}

/* ---------- backups ---------- */
async function backupNow(force = false) {
  const settings = await getSettings();
  if (!force && settings.autoBackup === false) return { ok: false, skipped: true };
  const history = await readHistory();
  if (!history.length) return { ok: false, skipped: true };
  const { backupMeta = {} } = await chrome.storage.local.get("backupMeta");
  if (
    !force &&
    backupMeta.lastTs &&
    Date.now() - Number(backupMeta.lastTs) < 86400000
  ) {
    return { ok: false, skipped: true };
  }
  const payload = {
    app: "IELTS Lookup",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    history,
    settings,
  };
  const json = JSON.stringify(payload);
  const encoded = encodeURIComponent(json);
  if (encoded.length > 1900000) {
    await chrome.storage.local.set({
      backupMeta: {
        lastTs: Date.now(),
        count: history.length,
        ok: false,
        error: "History is too large for the daily file backup.",
      },
    });
    return {
      ok: false,
      error: "History is too large for the daily file backup. Use History → JSON export.",
    };
  }
  const dataUrl = "data:application/json;charset=utf-8," + encoded;
  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: "IELTS-Lookup/ielts-history-backup.json",
      conflictAction: "overwrite",
      saveAs: false,
    });
    const meta = {
      lastTs: Date.now(),
      count: history.length,
      bytes: json.length,
      downloadId,
      ok: true,
    };
    await chrome.storage.local.set({ backupMeta: meta });
    return { ok: true, ...meta };
  } catch (error) {
    await chrome.storage.local.set({
      backupMeta: { ...backupMeta, ok: false, error: String(error) },
    });
    return { ok: false, error: String(error) };
  }
}

async function maybeBackup(force) {
  return backupNow(Boolean(force));
}

/* ---------- maintenance ---------- */
async function migrateStorage() {
  const { schemaVersion, history, settings } = await chrome.storage.local.get([
    "schemaVersion",
    "history",
    "settings",
  ]);
  const patch = {};
  if (!Array.isArray(history)) patch.history = [];
  else if (schemaVersion !== SCHEMA_VERSION) {
    patch.history = normalizeHistoryList(history);
  }
  if (settings && typeof settings === "object" && schemaVersion !== SCHEMA_VERSION) {
    const migrated = { ...settings };
    if (!schemaVersion && migrated.dict === "cambridge") migrated.dict = "auto";
    patch.settings = migrated;
  }
  if (schemaVersion !== SCHEMA_VERSION) patch.schemaVersion = SCHEMA_VERSION;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

async function pruneCache() {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith("c:"));
    if (!keys.length) return 0;
    const now = Date.now();
    const stale = new Set();
    const timestamped = [];
    for (const key of keys) {
      const value = all[key];
      const ts =
        value && typeof value === "object" && "t" in value ? Number(value.t) || 0 : 0;
      if (ts && now - ts > CACHE_TTL) stale.add(key);
      timestamped.push({ key, ts });
    }
    if (keys.length > MAX_CACHE) {
      timestamped.sort((a, b) => a.ts - b.ts);
      for (const item of timestamped.slice(0, keys.length - MAX_CACHE)) {
        stale.add(item.key);
      }
    }
    if (stale.size) await chrome.storage.local.remove([...stale]);
    return stale.size;
  } catch {
    return 0;
  }
}

function ensureAlarm() {
  chrome.alarms.create("ielts-backup", {
    delayInMinutes: 2,
    periodInMinutes: 1440,
  });
}

async function initialize() {
  await migrateStorage();
  ensureAlarm();
  await pruneCache();
  await restoreFromSync().catch(() => {});
  await maybeBackup(false).catch(() => {});
}

/* ---------- events ---------- */
chrome.runtime.onInstalled.addListener(() => {
  initialize();
});
chrome.runtime.onStartup.addListener(() => {
  initialize();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ielts-backup") maybeBackup(false).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message?.type) return;
  const run = async () => {
    switch (message.type) {
      case "fetch":
        return proxyFetch(message.url, message.as);
      case "history-add":
        return serial(() => addEntry(message.entry));
      case "history-remove":
        return serial(() => removeEntry(message.word));
      case "history-star":
        return serial(() =>
          starEntry(message.word, message.starred, message.entry),
        );
      case "history-clear":
        return serial(clearAll);
      case "history-undo":
        return serial(undoClear);
      case "history-import":
        return serial(() => importEntries(message.entries, message.mode));
      case "history-stats":
        return historyStats();
      case "history-mirror": {
        const settings = await getSettings();
        const history = await readHistory();
        await mirrorHistory(history, settings, true);
        return { ok: true, count: history.length };
      }
      case "cache-clear":
        return clearCache();
      case "backup-now":
        return backupNow(true);
      case "settings-changed": {
        const settings = { ...DEFAULTS, ...(message.settings || {}) };
        await mirrorSettings(settings);
        return { ok: true };
      }
      case "migrate":
        await migrateStorage();
        await restoreFromSync().catch(() => {});
        return { ok: true };
      default:
        return { ok: false, error: "unknown message" };
    }
  };
  run()
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "lookup-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "lookup-now" }).catch(() => {});
  }
});
