/* shared.js: constants and pure data helpers used by every extension context */
const SCHEMA_VERSION = 2;

const LANGS = {
  auto: "Detect language",
  en: "English",
  bn: "Bangla",
  hi: "Hindi",
  ur: "Urdu",
  ne: "Nepali",
  ta: "Tamil",
  ar: "Arabic",
  "zh-CN": "Chinese",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  pt: "Portuguese",
};

const DEFAULTS = {
  enabled: true,
  delay: 3,
  src: "en",
  tgt: "bn",
  dict: "auto",
  accent: "uk",
  theme: "auto",
  size: "normal",
  cardWidth: 400,
  banglaFirst: true,
  showPosBn: true,
  showIpa: true,
  showExamples: true,
  showSynonyms: true,
  showAntonyms: true,
  autoSave: true,
  syncMirror: true,
  autoBackup: true,
  doubleClick: false,
  maxChars: 60,
  maxWords: 6,
};

const POS_BN = {
  noun: "বিশেষ্য",
  verb: "ক্রিয়া",
  adjective: "বিশেষণ",
  adverb: "ক্রিয়াবিশেষণ",
  pronoun: "সর্বনাম",
  preposition: "পূর্বসর্গ",
  conjunction: "সংযোজক",
  interjection: "আবেগসূচক",
  determiner: "নির্ধারক",
  article: "নির্দেশক",
  number: "সংখ্যা",
  phrase: "বাক্যাংশ",
  idiom: "বাগধারা",
  prefix: "উপসর্গ",
  suffix: "প্রত্যয়",
  abbreviation: "সংক্ষিপ্ত রূপ",
};

const POS_ALIASES = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  pron: "pronoun",
  prep: "preposition",
  conj: "conjunction",
  interj: "interjection",
  det: "determiner",
  art: "article",
  num: "number",
  "proper noun": "noun",
  "phrasal verb": "verb",
  "auxiliary verb": "verb",
  "modal verb": "verb",
  "linking verb": "verb",
  exclamation: "interjection",
  exclamative: "interjection",
  "predeterminer": "determiner",
  "possessive determiner": "determiner",
};

function normalizePos(pos) {
  const p = String(pos || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return POS_ALIASES[p] || p;
}

function posBn(pos) {
  return POS_BN[normalizePos(pos)] || "";
}

function dedupe(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizeWord(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function normalizeHistoryEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const word = normalizeWord(raw.word);
  if (!word) return null;
  const meaning = String(raw.meaning || "").trim();
  const translations = dedupe([
    ...(Array.isArray(raw.translations) ? raw.translations : []),
    ...(Array.isArray(raw.bangla) ? raw.bangla : []),
    ...(meaning ? [meaning] : []),
  ]).slice(0, 10);
  const ts = Number(raw.ts) || Date.now();
  const firstTs = Number(raw.firstTs) || ts;
  return {
    ...raw,
    word,
    meaning: meaning || translations[0] || "",
    translations,
    bangla: raw.bangla && Array.isArray(raw.bangla) ? dedupe(raw.bangla).slice(0, 10) : translations,
    english: String(raw.english || "").trim(),
    pos: normalizePos(raw.pos || ""),
    source: String(raw.source || ""),
    tgt: String(raw.tgt || ""),
    ts,
    firstTs: Math.min(firstTs, ts),
    count: Math.max(1, Number(raw.count) || 1),
    starred: Boolean(raw.starred),
  };
}

function mergeHistoryEntries(a, b) {
  const newer = Number(b.ts || 0) > Number(a.ts || 0) ? b : a;
  const older = newer === a ? b : a;
  return normalizeHistoryEntry({
    ...older,
    ...newer,
    word: newer.word || older.word,
    meaning: newer.meaning || older.meaning,
    translations: dedupe([
      ...(older.translations || []),
      ...(newer.translations || []),
      ...(older.bangla || []),
      ...(newer.bangla || []),
    ]),
    bangla: dedupe([...(older.bangla || []), ...(newer.bangla || [])]),
    english: newer.english || older.english,
    pos: newer.pos || older.pos,
    source: newer.source || older.source,
    ts: Math.max(Number(a.ts) || 0, Number(b.ts) || 0),
    firstTs: Math.min(
      Number(a.firstTs || a.ts) || Date.now(),
      Number(b.firstTs || b.ts) || Date.now(),
    ),
    count: Math.max(Number(a.count) || 1, Number(b.count) || 1),
    starred: Boolean(a.starred || b.starred),
  });
}

function normalizeHistoryList(list) {
  const map = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    const entry = normalizeHistoryEntry(raw);
    if (!entry) continue;
    const key = entry.word.toLowerCase();
    const existing = map.get(key);
    map.set(key, existing ? mergeHistoryEntries(existing, entry) : entry);
  }
  return [...map.values()].sort((a, b) => b.ts - a.ts);
}

function mergeHistoryLists(base, incoming) {
  const map = new Map();
  for (const entry of normalizeHistoryList(base)) map.set(entry.word.toLowerCase(), entry);
  for (const entry of normalizeHistoryList(incoming)) {
    const key = entry.word.toLowerCase();
    const existing = map.get(key);
    map.set(key, existing ? mergeHistoryEntries(existing, entry) : entry);
  }
  return [...map.values()].sort((a, b) => b.ts - a.ts);
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatShortDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

function dayStart(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(ts) {
  const day = dayStart(ts);
  const today = dayStart(Date.now());
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7)
    return new Date(ts).toLocaleDateString(undefined, { weekday: "long" });
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function langName(code) {
  return LANGS[code] || code || "";
}

function isBanglaText(text) {
  return /[\u0980-\u09FF]/.test(String(text || ""));
}
