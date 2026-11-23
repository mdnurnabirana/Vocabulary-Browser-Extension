/* api.js: translation, dictionary sources, synonyms/antonyms, pronunciation */
const SOURCE_SHORT = {
  oxford: "Oxford",
  cambridge: "Cambridge",
  free: "Free Dictionary",
};
const SOURCE_FULL = {
  oxford: "Oxford Learner's Dictionaries",
  cambridge: "Cambridge Dictionary",
  free: "Free Dictionary",
};
const DICT_LABEL = {
  auto: "Auto",
  oxford: "Oxford Learner's",
  cambridge: "Cambridge",
  free: "Free Dictionary",
};

async function gtranslate(text, source, target) {
  const data = await getJSON(gurl(source, target, text, "&dt=t&dt=bd"));
  const main = (data[0] || [])
    .map((segment) => (segment && segment[0]) || "")
    .filter(Boolean)
    .join("")
    .trim();
  const alts = (data[1] || [])
    .map((group) => {
      const rawPos = String(group?.[0] || "").trim();
      const words = dedupe(
        (Array.isArray(group?.[1]) ? group[1] : [])
          .map((word) => String(word || "").trim())
          .filter(Boolean),
      );
      return {
        pos: normalizePos(rawPos) || (words.length ? "phrase" : ""),
        rawPos,
        words,
      };
    })
    .filter((group) => group.words.length);
  return { main, alts, detected: data[2] || "" };
}

async function translateMany(words, source, target) {
  const list = dedupe(words);
  if (!list.length) return [];
  try {
    const data = await getJSON(gurl(source, target, list.join("\n"), "&dt=t"));
    const segments = (data[0] || [])
      .map((segment) => String((segment && segment[0]) || "").trim())
      .filter(Boolean);
    if (segments.length === list.length) return segments;
  } catch {}
  return Promise.all(
    list.map((word) =>
      gtranslate(word, source, target)
        .then((result) => result.main)
        .catch(() => ""),
    ),
  );
}

async function related(word, rel) {
  const data = await getJSON(
    `https://api.datamuse.com/words?rel_${rel}=${encodeURIComponent(word)}&md=d&max=10`,
  );
  return (Array.isArray(data) ? data : [])
    .map((item) => {
      const parts = String((item.defs || [])[0] || "").split("\t");
      const pos = parts.length > 1 ? parts[0] : "";
      const def = parts.length > 1 ? parts.slice(1).join(" ") : "";
      return {
        word: String(item.word || "").trim(),
        pos: normalizePos(pos),
        def,
      };
    })
    .filter((item) => item.word && /\p{L}/u.test(item.word));
}

function addDictionaryEntry(out, pos, defs) {
  if (!defs.length) return;
  const normalized = normalizePos(pos) || "phrase";
  let bucket = out.entries.find((entry) => normalizePos(entry.pos) === normalized);
  if (!bucket) {
    bucket = { pos: normalized, defs: [] };
    out.entries.push(bucket);
  }
  for (const def of defs) {
    if (!def.def) continue;
    const key = def.def.toLowerCase();
    if (!bucket.defs.some((item) => item.def.toLowerCase() === key)) {
      bucket.defs.push(def);
    }
  }
}

async function freeDict(word) {
  const data = await getJSON(
    "https://api.dictionaryapi.dev/v2/entries/en/" + encodeURIComponent(word),
  );
  const out = {
    source: "Free Dictionary",
    sourceKey: "free",
    ipa: {},
    audio: {},
    entries: [],
    syn: [],
    ant: [],
  };
  for (const entry of Array.isArray(data) ? data : []) {
    for (const phonetic of entry.phonetics || []) {
      const audio = absUrl(phonetic.audio);
      const accent = audio.match(/[-_](uk|us)\./i)?.[1]?.toLowerCase() || "any";
      if (audio) out.audio[accent] ||= audio;
      if (phonetic.text) out.ipa[accent] ||= phonetic.text;
    }
    for (const meaning of entry.meanings || []) {
      const definitions = (meaning.definitions || []).slice(0, 4).map((def) => ({
        def: String(def.definition || "").trim(),
        examples: def.example ? [String(def.example).trim()] : [],
      }));
      addDictionaryEntry(out, meaning.partOfSpeech, definitions);
      out.syn.push(...(meaning.synonyms || []));
      out.ant.push(...(meaning.antonyms || []));
      for (const def of meaning.definitions || []) {
        out.syn.push(...(def.synonyms || []));
        out.ant.push(...(def.antonyms || []));
      }
    }
  }
  out.syn = dedupe(out.syn);
  out.ant = dedupe(out.ant);
  return out.entries.length ? out : null;
}

const slug = (word) =>
  encodeURIComponent(String(word).toLowerCase().replace(/\s+/g, "-"));
const CAM = (word) =>
  "https://dictionary.cambridge.org/dictionary/english/" + slug(word);
const OXF = (word) =>
  "https://www.oxfordlearnersdictionaries.com/definition/english/" + slug(word);

async function cambridge(word) {
  const html = await getText(CAM(word));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = {
    source: "Cambridge Dictionary",
    sourceKey: "cambridge",
    ipa: {},
    audio: {},
    entries: [],
    syn: [],
    ant: [],
  };
  const seen = new Set();
  const blocks = [
    ...doc.querySelectorAll(".pr.entry-body__el, .entry-body__el"),
  ].filter((block) => {
    if (seen.has(block)) return false;
    seen.add(block);
    return true;
  });
  for (const block of blocks) {
    const pos =
      block.querySelector(".pos.dpos")?.textContent.trim() ||
      block.querySelector(".pos")?.textContent.trim() ||
      "";
    for (const accent of ["uk", "us"]) {
      const pronunciation = block.querySelector(`.${accent}.dpron-i`);
      if (!pronunciation) continue;
      const ipa = pronunciation.querySelector(".ipa")?.textContent.trim();
      if (ipa) out.ipa[accent] ||= fmtIpa(ipa);
      const source = pronunciation
        .querySelector('source[type="audio/mpeg"]')
        ?.getAttribute("src");
      if (source) {
        out.audio[accent] ||= absUrl(source, "https://dictionary.cambridge.org");
      }
    }
    const defs = [...block.querySelectorAll(".def-block")]
      .slice(0, 5)
      .map((defBlock) => ({
        def: defBlock
          .querySelector(".def")
          ?.textContent.trim()
          .replace(/:$/, ""),
        examples: [...defBlock.querySelectorAll(".examp .eg")]
          .slice(0, 3)
          .map((example) => example.textContent.trim()),
      }))
      .filter((def) => def.def);
    addDictionaryEntry(out, pos, defs);
    for (const ref of block.querySelectorAll(".xrefs .Ref, .xrefs .xh")) {
      const text = ref.textContent.trim();
      if (text) out.syn.push(text);
    }
  }
  out.syn = dedupe(out.syn);
  return out.entries.length ? out : null;
}

async function oxford(word) {
  const html = await getText(OXF(word));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = {
    source: "Oxford Learner's Dictionaries",
    sourceKey: "oxford",
    ipa: {},
    audio: {},
    entries: [],
    syn: [],
    ant: [],
  };
  const uk = doc.querySelector(".phons_br");
  const us = doc.querySelector(".phons_n_am");
  if (uk) {
    out.ipa.uk = fmtIpa(uk.querySelector(".phon")?.textContent.trim());
    out.audio.uk = absUrl(
      uk.querySelector("[data-src-mp3]")?.getAttribute("data-src-mp3"),
      "https://www.oxfordlearnersdictionaries.com",
    );
  }
  if (us) {
    out.ipa.us = fmtIpa(us.querySelector(".phon")?.textContent.trim());
    out.audio.us = absUrl(
      us.querySelector("[data-src-mp3]")?.getAttribute("data-src-mp3"),
      "https://www.oxfordlearnersdictionaries.com",
    );
  }
  const allEntries = [...doc.querySelectorAll("#entryContent .entry, .entry")];
  const topEntries = allEntries.filter(
    (entry) => !entry.parentElement?.closest(".entry"),
  );
  for (const entry of topEntries.length ? topEntries : allEntries) {
    const pos =
      entry.querySelector(".webtop .pos")?.textContent.trim() ||
      entry.querySelector(".pos")?.textContent.trim() ||
      "";
    const senses = [...entry.querySelectorAll("li.sense")]
      .slice(0, 6)
      .map((sense) => ({
        def: sense.querySelector(".def")?.textContent.trim(),
        examples: [...sense.querySelectorAll("ul.examples .x")]
          .slice(0, 3)
          .map((example) => example.textContent.trim()),
      }))
      .filter((sense) => sense.def);
    addDictionaryEntry(out, pos, senses);
    for (const ref of entry.querySelectorAll(".xrefs .Ref, .xrefs .xh")) {
      const text = ref.textContent.trim();
      if (text) out.syn.push(text);
    }
  }
  out.syn = dedupe(out.syn);
  return out.entries.length ? out : null;
}

const getFree = (word) =>
  cached("free:" + word.toLowerCase(), () => freeDict(word)).catch(() => null);
const getCam = (word) =>
  cached("cam:" + word.toLowerCase(), () => cambridge(word)).catch(() => null);
const getOx = (word) =>
  cached("ox:" + word.toLowerCase(), () => oxford(word)).catch(() => null);

async function getDefinitions(word) {
  const requested = S.dict || "auto";
  const autoOrder = ["oxford", "cambridge", "free"];
  const order =
    requested === "auto"
      ? autoOrder
      : [requested, ...autoOrder.filter((item) => item !== requested)];
  for (const source of order) {
    let data = null;
    try {
      if (source === "oxford") data = await getOx(word);
      else if (source === "cambridge") data = await getCam(word);
      else data = await getFree(word);
    } catch {}
    if (data?.entries?.length) {
      return {
        data,
        source,
        requested,
        fellBack: requested !== "auto" && source !== requested,
      };
    }
  }
  return { data: null, source: null, requested, fellBack: false };
}

function relatedFull(word, rel) {
  return cached(`rel:${rel}:${S.tgt}:${word.toLowerCase()}`, async () => {
    const [base, free] = await Promise.all([
      related(word, rel).catch(() => []),
      getFree(word).catch(() => null),
    ]);
    const merged = [];
    const seen = new Set();
    const key = word.toLowerCase();
    const add = (item) => {
      const value = String(item.word || "").trim();
      if (!value || value.toLowerCase() === key) return;
      const normalized = value.toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);
      merged.push(item);
    };
    for (const item of base) add(item);
    for (const value of free?.[rel] || []) add({ word: value });
    if (!merged.length) return null;
    const translations =
      S.tgt === "en"
        ? []
        : await translateMany(
            merged.map((item) => item.word),
            "en",
            S.tgt,
          ).catch(() => []);
    return merged.slice(0, 10).map((item, index) => ({
      ...item,
      tr: translations[index] || "",
    }));
  });
}

/* ---------- pronunciation ---------- */
let currentAudio = null;

function speak(text, accent) {
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = accent === "uk" ? "en-GB" : "en-US";
    utterance.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  } catch {}
}

function pronounce(text, url, accent) {
  if (url) {
    try {
      if (currentAudio) currentAudio.pause();
      currentAudio = new Audio(url);
      currentAudio.play().catch(() => speak(text, accent));
      return;
    } catch {}
  }
  speak(text, accent);
}
