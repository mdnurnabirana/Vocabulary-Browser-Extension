/* core.js: settings, storage helpers, history API, DOM and clipboard helpers */
let S = { ...DEFAULTS };

function clampSettings(s) {
  s.delay = Math.min(10, Math.max(0.3, Number(s.delay) || 3));
  s.cardWidth = Math.min(520, Math.max(340, Number(s.cardWidth) || 400));
  s.maxChars = Math.min(200, Math.max(12, Number(s.maxChars) || 60));
  s.maxWords = Math.min(12, Math.max(1, Number(s.maxWords) || 6));
  if (!["auto", "light", "dark"].includes(s.theme)) s.theme = "auto";
  if (!["compact", "normal", "large"].includes(s.size)) s.size = "normal";
  if (!["auto", "oxford", "cambridge", "free"].includes(s.dict)) s.dict = "auto";
  if (!["uk", "us"].includes(s.accent)) s.accent = "uk";
  return s;
}

async function loadSettings() {
  try {
    const stored = (await chrome.storage.local.get("settings")).settings || {};
    S = clampSettings({ ...DEFAULTS, ...stored });
  } catch {
    S = { ...DEFAULTS };
  }
  return S;
}

async function saveSettings() {
  S = clampSettings({ ...DEFAULTS, ...S });
  await chrome.storage.local.set({ settings: S });
  sendBg("settings-changed", { settings: S });
  return S;
}

function applyAppearance(root = document.documentElement) {
  if (!root) return;
  root.dataset.theme = S.theme || "auto";
  root.dataset.size = S.size || "normal";
  root.style.setProperty("--card-w", `${S.cardWidth || 400}px`);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    S = clampSettings({ ...DEFAULTS, ...(changes.settings.newValue || {}) });
  }
});

/* ---------- messaging ---------- */
async function sendBg(type, data = {}) {
  try {
    return (await chrome.runtime.sendMessage({ type, ...data })) || { ok: false };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function getHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  return normalizeHistoryList(history);
}

async function getHistoryEntry(word) {
  const key = normalizeWord(word).toLowerCase();
  if (!key) return null;
  const history = await getHistory();
  return history.find((entry) => entry.word.toLowerCase() === key) || null;
}

async function addHistory(word, details = {}) {
  return sendBg("history-add", {
    entry: {
      word: normalizeWord(word),
      meaning: details.meaning || "",
      translations: details.translations || [],
      bangla: details.bangla || [],
      english: details.english || "",
      pos: details.pos || "",
      source: details.source || "",
      tgt: details.tgt || S.tgt,
    },
  });
}

async function removeHistory(word) {
  return sendBg("history-remove", { word });
}

async function toggleStar(word, starred, entry) {
  return sendBg("history-star", { word, starred, entry });
}

async function clearHistory() {
  return sendBg("history-clear");
}

async function undoClearHistory() {
  return sendBg("history-undo");
}

async function importHistory(entries, mode = "merge") {
  return sendBg("history-import", { entries, mode });
}

async function backupNow() {
  return sendBg("backup-now");
}

async function mirrorHistoryNow() {
  return sendBg("history-mirror");
}

async function getStats() {
  return sendBg("history-stats");
}

async function clearCache() {
  return sendBg("cache-clear");
}

/* ---------- cache ---------- */
async function cached(key, fn, ttlMs = 45 * 86400000) {
  const storageKey = "c:" + key;
  try {
    const hit = (await chrome.storage.local.get(storageKey))[storageKey];
    if (hit && typeof hit === "object" && "v" in hit && "t" in hit) {
      if (Date.now() - Number(hit.t) < ttlMs) return hit.v;
      chrome.storage.local.remove(storageKey);
    } else if (hit !== undefined) {
      return hit; // legacy unwrapped cache entry
    }
  } catch {}
  const value = await fn();
  if (value != null) {
    try {
      await chrome.storage.local.set({
        [storageKey]: { v: value, t: Date.now() },
      });
    } catch {}
  }
  return value;
}

/* ---------- network (through background.js) ---------- */
async function bg(url, as) {
  const result = await sendBg("fetch", { url, as });
  if (!result?.ok) {
    throw new Error(result?.status || result?.error || "fetch failed");
  }
  return result.data;
}

const getJSON = (url) => bg(url, "json");
const getText = (url) => bg(url, "text");

const gurl = (source, target, query, extra = "") =>
  `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}${extra}&q=${encodeURIComponent(query)}`;

/* ---------- DOM helpers ---------- */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style" && typeof value === "string")
      node.style.cssText = value;
    else if (key.startsWith("on") && typeof value === "function")
      node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

const muted = (text) => el("span", { class: "muted" }, text);

function skeletonBlock(lines = 3) {
  const widths = ["w85", "w70", "w45", "w85"];
  return el(
    "div",
    { class: "skeleton", "aria-hidden": "true" },
    ...Array.from({ length: lines }, (_, index) =>
      el("div", { class: `sk-line ${widths[index % widths.length]}` }),
    ),
  );
}

function fmtIpa(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (/^[/[].*[/\]]$/.test(value)) return value;
  return `/${value}/`;
}

function absUrl(url, base) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return "https:" + value;
  try {
    return new URL(value, base).href;
  } catch {
    return value;
  }
}

async function copyText(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.documentElement.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function flashCopied(button) {
  if (!button) return;
  const original = button.textContent;
  button.classList.add("copied");
  button.textContent = "কপি হয়েছে";
  setTimeout(() => {
    button.classList.remove("copied");
    button.textContent = original;
  }, 900);
}

function wordClass(word) {
  return isBanglaText(word) ? "bn" : "";
}
