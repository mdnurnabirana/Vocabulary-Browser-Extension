/* core.js: shared by the on-page card (content.js) and the toolbar popup (popup.js) */

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
  dict: "cambridge",
  accent: "uk",
};
let S = { ...DEFAULTS };

async function loadSettings() {
  S = {
    ...DEFAULTS,
    ...((await chrome.storage.local.get("settings")).settings || {}),
  };
}
const saveSettings = () => chrome.storage.local.set({ settings: S });
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.settings)
    S = { ...DEFAULTS, ...(ch.settings.newValue || {}) };
});

/* ---------- styles (used inside the on-page shadow DOM and the popup page) ---------- */
const CSS = `
:host,:root{--bg:#fff;--fg:#1d1d1f;--muted:#6b7280;--card:#f5f6f8;--line:#e3e5e8;--accent:#2563eb;--warn:#b45309}
@media (prefers-color-scheme:dark){:host,:root{--bg:#17181b;--fg:#e8e8ea;--muted:#9aa0a6;--card:#222428;--line:#33363b;--accent:#6ea0ff;--warn:#f0a35e}}
*{box-sizing:border-box}
select,input,button{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:4px 8px}
button{cursor:pointer}
button:hover{border-color:var(--accent)}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:8px}
h3{margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.big{font-size:20px;font-weight:600}
.alt{margin-top:2px}
.pos{font-size:11px;background:var(--line);border-radius:4px;padding:0 5px;margin-right:4px}
.def{margin:6px 0}
.eg{color:var(--muted);font-style:italic;margin:2px 0 0 10px}
.rel{margin:6px 0}
.muted{color:var(--muted);font-size:13px}
.pill{margin:0 4px 4px 0}
.link{border:0;background:none;padding:0;color:var(--accent);font-weight:600}
a{color:var(--accent)}
.note{color:var(--warn);font-size:12px;margin-top:4px}
.foot{margin:2px 2px 0}
`;

/* ---------- tiny DOM helper (text only, so web content can't inject HTML) ---------- */
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const muted = (t) => el("span", { class: "muted" }, t);

/* ---------- local cache and history ---------- */
async function cached(key, fn) {
  const k = "c:" + key;
  const hit = (await chrome.storage.local.get(k))[k];
  if (hit) return hit;
  const val = await fn();
  if (val) await chrome.storage.local.set({ [k]: val });
  return val;
}

async function addHistory(word, meaning) {
  try {
    const { history = [] } = await chrome.storage.local.get("history");
    const key = word.toLowerCase();
    const old = history.find((h) => h.word.toLowerCase() === key);
    const rest = history.filter((h) => h !== old);
    rest.unshift({
      word,
      meaning,
      ts: Date.now(),
      count: (old?.count || 0) + 1,
    });
    await chrome.storage.local.set({ history: rest });
  } catch {}
}
async function removeHistory(word) {
  const { history = [] } = await chrome.storage.local.get("history");
  const key = word.toLowerCase();
  await chrome.storage.local.set({
    history: history.filter((h) => h.word.toLowerCase() !== key),
  });
}

/* ---------- network (all requests go through background.js) ---------- */
async function bg(url, as) {
  const r = await chrome.runtime.sendMessage({ type: "fetch", url, as });
  if (!r?.ok) throw new Error(r?.status || r?.error || "fetch failed");
  return r.data;
}
const getJSON = (u) => bg(u, "json");
const getText = (u) => bg(u, "text");

const gurl = (sl, tl, q, extra) =>
  `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}${extra}&q=${encodeURIComponent(q)}`;

async function gtranslate(text, sl, tl) {
  const d = await getJSON(gurl(sl, tl, text, "&dt=t&dt=bd"));
  return {
    main: (d[0] || [])
      .map((x) => x[0])
      .filter(Boolean)
      .join(""),
    alts: (d[1] || []).map((e) => ({ pos: e[0], words: e[1] })),
    detected: d[2],
  };
}

async function translateMany(words, sl, tl) {
  if (!words.length) return [];
  const d = await getJSON(gurl(sl, tl, words.join("\n"), "&dt=t"));
  const segs = (d[0] || []).map((x) => (x[0] || "").trim()).filter(Boolean);
  if (segs.length === words.length) return segs;
  return Promise.all(
    words.map((w) =>
      gtranslate(w, sl, tl)
        .then((r) => r.main)
        .catch(() => ""),
    ),
  );
}

async function related(word, rel) {
  // rel = 'syn' | 'ant'
  const d = await getJSON(
    `https://api.datamuse.com/words?rel_${rel}=${encodeURIComponent(word)}&md=d&max=8`,
  );
  return d.map((x) => {
    const [p, ...rest] = ((x.defs || [])[0] || "").split("\t");
    return { word: x.word, pos: rest.length ? p : "", def: rest.join(" ") };
  });
}

async function freeDict(word) {
  const data = await getJSON(
    "https://api.dictionaryapi.dev/v2/entries/en/" + encodeURIComponent(word),
  );
  const out = {
    source: "Free Dictionary",
    ipa: {},
    audio: {},
    entries: [],
    syn: [],
    ant: [],
  };
  for (const e of data) {
    for (const p of e.phonetics || []) {
      const a = (p.audio || "").match(/-(uk|us)\./)?.[1];
      if (a && p.audio) out.audio[a] ||= p.audio;
      if (a && p.text) out.ipa[a] ||= p.text;
      if (p.text) out.ipa.any ||= p.text;
    }
    for (const m of e.meanings || []) {
      out.entries.push({
        pos: m.partOfSpeech,
        defs: (m.definitions || [])
          .slice(0, 3)
          .map((x) => ({
            def: x.definition,
            examples: x.example ? [x.example] : [],
          })),
      });
      out.syn.push(...(m.synonyms || []));
      out.ant.push(...(m.antonyms || []));
    }
  }
  out.syn = [...new Set(out.syn)];
  out.ant = [...new Set(out.ant)];
  return out.entries.length ? out : null;
}

const slug = (w) => encodeURIComponent(w.toLowerCase().replace(/\s+/g, "-"));
const CAM = (w) =>
  "https://dictionary.cambridge.org/dictionary/english/" + slug(w);
const OXF = (w) =>
  "https://www.oxfordlearnersdictionaries.com/definition/english/" + slug(w);

async function cambridge(word) {
  const doc = new DOMParser().parseFromString(
    await getText(CAM(word)),
    "text/html",
  );
  const out = {
    source: "Cambridge Dictionary",
    ipa: {},
    audio: {},
    entries: [],
  };
  doc.querySelectorAll(".pr.entry-body__el").forEach((entry) => {
    const pos = entry.querySelector(".pos.dpos")?.textContent.trim();
    for (const a of ["uk", "us"]) {
      const p = entry.querySelector(`.${a}.dpron-i`);
      if (!p) continue;
      const ipa = p.querySelector(".ipa")?.textContent.trim();
      if (ipa) out.ipa[a] ||= `/${ipa}/`;
      const src = p
        .querySelector('source[type="audio/mpeg"]')
        ?.getAttribute("src");
      if (src) out.audio[a] ||= "https://dictionary.cambridge.org" + src;
    }
    const defs = [...entry.querySelectorAll(".def-block")]
      .slice(0, 4)
      .map((b) => ({
        def: b.querySelector(".def")?.textContent.trim().replace(/:$/, ""),
        examples: [...b.querySelectorAll(".examp .eg")]
          .slice(0, 3)
          .map((x) => x.textContent.trim()),
      }))
      .filter((d) => d.def);
    if (defs.length) out.entries.push({ pos, defs });
  });
  return out.entries.length ? out : null;
}

async function oxford(word) {
  const doc = new DOMParser().parseFromString(
    await getText(OXF(word)),
    "text/html",
  );
  const out = {
    source: "Oxford Learner's Dictionaries",
    ipa: {},
    audio: {},
    entries: [],
  };
  const uk = doc.querySelector(".phons_br"),
    us = doc.querySelector(".phons_n_am");
  if (uk) {
    out.ipa.uk = uk.querySelector(".phon")?.textContent.trim();
    out.audio.uk = uk
      .querySelector("[data-src-mp3]")
      ?.getAttribute("data-src-mp3");
  }
  if (us) {
    out.ipa.us = us.querySelector(".phon")?.textContent.trim();
    out.audio.us = us
      .querySelector("[data-src-mp3]")
      ?.getAttribute("data-src-mp3");
  }
  const defs = [...doc.querySelectorAll("li.sense")]
    .slice(0, 5)
    .map((s) => ({
      def: s.querySelector(".def")?.textContent.trim(),
      examples: [...s.querySelectorAll("ul.examples .x")]
        .slice(0, 3)
        .map((x) => x.textContent.trim()),
    }))
    .filter((d) => d.def);
  if (defs.length)
    out.entries.push({
      pos: doc.querySelector(".webtop .pos")?.textContent.trim(),
      defs,
    });
  return out.entries.length ? out : null;
}

/* ---------- lookups with fallback ---------- */
const getFree = (w) => cached("free:" + w, () => freeDict(w)).catch(() => null);

async function getDefinitions(w) {
  let data = null;
  try {
    if (S.dict === "cambridge")
      data = await cached("cam:" + w, () => cambridge(w));
    else if (S.dict === "oxford")
      data = await cached("ox:" + w, () => oxford(w));
  } catch {}
  if (data) return { data, fellBack: false };
  data = await getFree(w);
  return { data, fellBack: S.dict !== "free" && !!data };
}

function relatedFull(w, rel) {
  return cached(`rel:${rel}:${S.tgt}:${w}`, async () => {
    const base = await related(w, rel);
    const fd = await getFree(w);
    const seen = new Set(base.map((x) => x.word));
    for (const x of fd?.[rel] || [])
      if (!seen.has(x) && base.length < 10) {
        seen.add(x);
        base.push({ word: x });
      }
    if (!base.length) return null;
    const tl =
      S.tgt === "en"
        ? []
        : await translateMany(
            base.map((x) => x.word),
            "en",
            S.tgt,
          );
    return base.map((x, i) => ({ ...x, tr: tl[i] || "" }));
  });
}

/* ---------- pronunciation ---------- */
function speak(text, accent) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = accent === "uk" ? "en-GB" : "en-US";
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function pronounce(text, url, accent) {
  if (url) new Audio(url).play().catch(() => speak(text, accent));
  else speak(text, accent);
}
function pronRow(w, data) {
  const order = S.accent === "uk" ? ["uk", "us"] : ["us", "uk"];
  const btns = order.map((a) =>
    el(
      "button",
      { class: "pill", onclick: () => pronounce(w, data?.audio?.[a], a) },
      `🔊 ${a.toUpperCase()}`,
      data?.ipa?.[a] ? " " + data.ipa[a] : "",
    ),
  );
  if (!data?.ipa?.uk && !data?.ipa?.us && data?.ipa?.any)
    btns.push(muted(data.ipa.any));
  return el("div", {}, ...btns);
}

/* ---------- rendering ---------- */
const LABEL = { cambridge: "Cambridge", oxford: "Oxford" };

function section(out, title) {
  const body = el("div", {}, muted("Loading…"));
  out.append(el("section", {}, el("h3", {}, title), body));
  return body;
}

function renderTranslation(body, tr) {
  if (!tr)
    return body.replaceChildren(
      muted("Translation failed. Check your connection."),
    );
  body.replaceChildren(
    el("div", { class: "big" }, tr.main),
    ...tr.alts.map((a) =>
      el(
        "div",
        { class: "alt" },
        el("span", { class: "pos" }, a.pos),
        a.words.slice(0, 8).join(", "),
      ),
    ),
  );
}

function renderEntries(body, data, fellBack) {
  if (!data) return body.replaceChildren(muted("No entry found."));
  const kids = data.entries.map((e) =>
    el(
      "div",
      {},
      el("span", { class: "pos" }, e.pos || ""),
      e.defs.map((d) =>
        el(
          "div",
          { class: "def" },
          d.def,
          d.examples.map((x) => el("div", { class: "eg" }, x)),
        ),
      ),
    ),
  );
  kids.push(muted("Source: " + data.source));
  if (fellBack)
    kids.push(
      el(
        "div",
        { class: "note" },
        `${LABEL[S.dict]} couldn't be loaded, so this is the Free Dictionary instead.`,
      ),
    );
  body.replaceChildren(...kids);
}

function renderRelated(body, items, go) {
  if (!items?.length) return body.replaceChildren(muted("None found."));
  body.replaceChildren(
    ...items.map((x) =>
      el(
        "div",
        { class: "rel" },
        el("button", { class: "link", onclick: () => go(x.word) }, x.word),
        x.tr ? " · " + x.tr : "",
        x.def
          ? el("div", { class: "muted" }, (x.pos ? `(${x.pos}) ` : "") + x.def)
          : null,
      ),
    ),
  );
}

/* ---------- main flow: fills `out` with every section for one word ---------- */
async function runLookup(out, raw, { onWord, record = true } = {}) {
  const word = (raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!word) return;
  const my = (out._t = (out._t || 0) + 1),
    alive = () => my === out._t;
  onWord?.(word);
  out.replaceChildren();
  const go = (w) => runLookup(out, w, { onWord, record });

  const trBody = section(out, `Meaning · ${LANGS[S.src]} → ${LANGS[S.tgt]}`);
  const tr = await cached(`tr:${S.src}:${S.tgt}:${word.toLowerCase()}`, () =>
    gtranslate(word, S.src, S.tgt),
  ).catch(() => null);
  if (!alive()) return;
  renderTranslation(trBody, tr);
  if (tr && record) addHistory(word, tr.main);

  // Dictionary features need an English headword
  const srcLang = S.src === "auto" ? tr?.detected : S.src;
  let en = null;
  if (srcLang === "en") en = word;
  else if (S.tgt === "en" && tr?.main) en = tr.main;
  if (!en || en.split(" ").length > 3) return;
  en = en.toLowerCase();

  const pronBody = section(out, "Pronunciation");
  pronBody.replaceChildren(pronRow(en, null));
  const defBody = section(out, "Definitions & examples");
  const synBody = section(out, "Synonyms");
  const antBody = section(out, "Antonyms");
  out.append(
    el(
      "div",
      { class: "muted foot" },
      "Open full entry: ",
      el(
        "a",
        { href: CAM(en), target: "_blank", rel: "noopener noreferrer" },
        "Cambridge",
      ),
      " · ",
      el(
        "a",
        { href: OXF(en), target: "_blank", rel: "noopener noreferrer" },
        "Oxford",
      ),
    ),
  );

  const fail = (b) => () =>
    alive() && b.replaceChildren(muted("Could not load (offline or blocked)."));
  getDefinitions(en)
    .then(({ data, fellBack }) => {
      if (!alive()) return;
      pronBody.replaceChildren(pronRow(en, data));
      renderEntries(defBody, data, fellBack);
    })
    .catch(fail(defBody));
  relatedFull(en, "syn")
    .then((x) => alive() && renderRelated(synBody, x, go))
    .catch(fail(synBody));
  relatedFull(en, "ant")
    .then((x) => alive() && renderRelated(antBody, x, go))
    .catch(fail(antBody));
}