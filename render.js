/* render.js: bilingual entry rendering and the main lookup flow */

function buildGroups(translation, definitions, target) {
  const groups = [];
  const groupFor = (pos) => {
    const normalized = normalizePos(pos) || "phrase";
    let group = groups.find((item) => item.pos === normalized);
    if (!group) {
      group = {
        pos: normalized,
        rawPos: String(pos || normalized).trim(),
        translations: [],
        defs: [],
      };
      groups.push(group);
    }
    return group;
  };

  for (const entry of definitions?.entries || []) {
    const group = groupFor(entry.pos);
    for (const def of entry.defs || []) {
      if (def?.def) group.defs.push(def);
    }
  }

  const altGroups = [];
  for (const alt of translation?.alts || []) {
    if (alt.words?.length) {
      altGroups.push({ pos: normalizePos(alt.pos) || "phrase", words: [...alt.words] });
    }
  }
  const main = String(translation?.main || "").trim();
  if (main) {
    const holder = altGroups.find((group) =>
      group.words.some((word) => word.toLowerCase() === main.toLowerCase()),
    );
    if (holder) {
      holder.words = [main, ...holder.words.filter((word) => word !== main)];
    } else if (altGroups.length) {
      altGroups[0].words = [main, ...altGroups[0].words];
    } else {
      altGroups.push({ pos: "phrase", words: [main] });
    }
  }

  for (const alt of altGroups) {
    const group = groupFor(alt.pos);
    group.translations = dedupe([...(group.translations || []), ...alt.words]);
  }

  return groups.filter((group) => group.translations.length || group.defs.length);
}

function pronRow(word, data) {
  const order = S.accent === "uk" ? ["uk", "us"] : ["us", "uk"];
  const buttons = order.map((accent) => {
    const ipa = S.showIpa ? fmtIpa(data?.ipa?.[accent]) : "";
    return el(
      "button",
      {
        class: "pron-btn",
        type: "button",
        title: `Play ${accent.toUpperCase()} pronunciation`,
        "aria-label": `Play ${accent.toUpperCase()} pronunciation`,
        onclick: () => pronounce(word, data?.audio?.[accent], accent),
      },
      `🔊 ${accent.toUpperCase()}`,
      ipa ? el("span", { class: "ipa" }, ipa) : null,
    );
  });
  if (S.showIpa && !data?.ipa?.uk && !data?.ipa?.us && data?.ipa?.any) {
    buttons.push(el("span", { class: "ipa" }, fmtIpa(data.ipa.any)));
  }
  return el("div", { class: "subline" }, ...buttons);
}

function translationsLine(groups) {
  const label = S.tgt === "bn" ? "বাংলা" : S.tgt === "en" ? "English" : langName(S.tgt);
  const words = dedupe(groups.flatMap((group) => group.translations || [])).slice(0, 8);
  if (!words.length) return null;
  const chips = words.map((word) => {
    const chip =
      S.tgt === "bn"
        ? el("button", { class: "bn-chip", type: "button", title: "Copy meaning" }, word)
        : el("button", { class: "chip", type: "button", title: "Copy meaning" }, el("span", { class: "chip-word" }, word));
    chip.addEventListener("click", async () => {
      const ok = await copyText(word);
      if (ok) flashCopied(chip);
    });
    return chip;
  });
  return el(
    "div",
    { class: "tr-line" },
    el("span", { class: "tr-label" }, label),
    el("div", { class: "bn-list" }, ...chips),
  );
}

function definitionsList(group) {
  if (!group.defs.length) return null;
  const showNumbers = group.defs.length > 1;
  return el(
    "ul",
    { class: "defs" },
    ...group.defs.slice(0, 5).map((def, index) =>
      el(
        "li",
        { class: "def-item" },
        showNumbers ? el("span", { class: "def-num" }, String(index + 1)) : null,
        el(
          "div",
          {},
          el("div", { class: "def-text" }, def.def),
          S.showExamples && def.examples?.length
            ? el(
                "div",
                { class: "examples" },
                ...def.examples.slice(0, 3).map((example) => el("div", { class: "ex" }, example)),
              )
            : null,
        ),
      ),
    ),
  );
}

function renderQuickMeaning(body, translation) {
  const groups = buildGroups(translation, null, S.tgt);
  const line = translationsLine(groups);
  if (line) body.replaceChildren(line);
}

function renderSenses(body, groups, translation, definitions) {
  if (!groups.length) {
    body.replaceChildren(
      el(
        "div",
        { class: "empty" },
        definitions?.data
          ? "No definition found."
          : translation
            ? "Translation only — no dictionary entry was available."
            : "No entry found.",
      ),
    );
    return;
  }
  const blocks = groups.map((group) => {
    const head = el(
      "div",
      { class: "sense-head" },
      group.pos ? el("span", { class: "pos-badge" }, group.rawPos || group.pos) : null,
      S.showPosBn && posBn(group.pos)
        ? el("span", { class: "pos-bn" }, posBn(group.pos))
        : null,
    );
    const line = translationsLine([group]);
    const defs = definitionsList(group);
    return el(
      "div",
      { class: "sense-group" },
      head,
      S.banglaFirst ? line : defs,
      S.banglaFirst ? defs : line,
    );
  });
  body.replaceChildren(...blocks);

  if (!definitions?.data && translation) {
    if (definitions?.attempted) {
      body.append(
        el(
          "div",
          { class: "note" },
          "Dictionary definitions could not be loaded for this word. Translation is shown above.",
        ),
      );
    }
  } else if (definitions?.fellBack) {
    body.append(
      el(
        "div",
        { class: "note" },
        `${DICT_LABEL[definitions.requested] || "The selected dictionary"} could not be loaded, so this entry is from ${SOURCE_SHORT[definitions.source] || definitions.source}.`,
      ),
    );
  }
}

function renderRelated(body, items, go) {
  if (!items?.length) {
    body.replaceChildren(muted("None found."));
    return;
  }
  body.replaceChildren(
    el(
      "div",
      { class: "chip-row" },
      ...items.map((item) =>
        el(
          "button",
          {
            class: "chip",
            type: "button",
            title: item.def
              ? `${item.pos ? `(${item.pos}) ` : ""}${item.def}`
              : `Look up ${item.word}`,
            onclick: () => go(item.word),
          },
          el("span", { class: "chip-word" }, item.word),
          item.tr ? el("span", { class: "chip-tr" }, item.tr) : null,
        ),
      ),
    ),
  );
}

function renderFooter(word, englishWord) {
  const target = englishWord || word;
  return el(
    "div",
    { class: "foot" },
    "Open:",
    el("a", { href: CAM(target), target: "_blank", rel: "noopener noreferrer" }, "Cambridge"),
    "·",
    el("a", { href: OXF(target), target: "_blank", rel: "noopener noreferrer" }, "Oxford"),
    "·",
    el(
      "a",
      {
        href: "https://en.wiktionary.org/wiki/" + slug(target),
        target: "_blank",
        rel: "noopener noreferrer",
      },
      "Wiktionary",
    ),
    el(
      "button",
      {
        class: "link-btn",
        type: "button",
        style: "margin-left:auto",
        onclick: () => copyText(word),
      },
      "Copy word",
    ),
  );
}

async function runLookup(out, raw, { onWord, record = true } = {}) {
  const word = normalizeWord(raw);
  if (!word) return null;
  const token = (out._t = (out._t || 0) + 1);
  const alive = () => token === out._t;
  onWord?.(word);
  out.replaceChildren();

  const showTranslation = S.src !== S.tgt;
  const looksEnglish =
    !isBanglaText(word) && /^[A-Za-z\u00C0-\u024F]/.test(word);
  let guessEnglish =
    S.src === "en" || (S.src === "auto" && looksEnglish) ? word.toLowerCase() : null;
  let definitionsFor = guessEnglish;

  const noDefinitions = () => ({
    data: null,
    source: null,
    requested: S.dict,
    fellBack: false,
  });

  const translationPromise = showTranslation
    ? cached(`tr:${S.src}:${S.tgt}:${word.toLowerCase()}`, () =>
        gtranslate(word, S.src, S.tgt),
      ).catch(() => null)
    : Promise.resolve(null);
  const definitionsPromise = definitionsFor
    ? getDefinitions(definitionsFor).catch(noDefinitions)
    : null;

  const starButton = el(
    "button",
    { class: "icon-btn star", type: "button", title: "Star this word", "aria-label": "Star this word" },
    "☆",
  );
  const copyButton = el(
    "button",
    { class: "icon-btn", type: "button", title: "Copy word", "aria-label": "Copy word" },
    "⧉",
  );
  const hero = el(
    "div",
    { class: "hero" },
    el(
      "div",
      { class: "word-row" },
      el(
        "h1",
        { class: `word ${wordClass(word)}`, lang: isBanglaText(word) ? "bn" : "en" },
        word,
      ),
      el("div", { class: "hero-actions" }, starButton, copyButton),
    ),
    el("div", { class: "subline-slot" }),
  );

  const meaningBody = el("div", { class: "panel-body" }, skeletonBlock(4));
  const meaningPanel = el(
    "section",
    { class: "panel" },
    el(
      "div",
      { class: "panel-head" },
      el("h2", { class: "panel-title" }, "Meaning"),
      el("span", { class: "route" }, `${langName(S.src)} → ${langName(S.tgt)}`),
      el("span", { class: "source-badge" }, "loading"),
    ),
    meaningBody,
  );

  const synonyms = S.showSynonyms
    ? el(
        "section",
        { class: "panel" },
        el("div", { class: "panel-head" }, el("h2", { class: "panel-title" }, "Synonyms")),
        (() => {
          const body = el("div", { class: "panel-body" }, skeletonBlock(2));
          body.dataset.role = "synonyms";
          return body;
        })(),
      )
    : null;
  const antonyms = S.showAntonyms
    ? el(
        "section",
        { class: "panel" },
        el("div", { class: "panel-head" }, el("h2", { class: "panel-title" }, "Antonyms")),
        (() => {
          const body = el("div", { class: "panel-body" }, skeletonBlock(2));
          body.dataset.role = "antonyms";
          return body;
        })(),
      )
    : null;
  const synonymsBody = synonyms?.querySelector('[data-role="synonyms"]');
  const antonymsBody = antonyms?.querySelector('[data-role="antonyms"]');

  const entry = el("div", { class: "entry" }, hero, meaningPanel, synonyms, antonyms);
  out.append(entry);

  let starred = false;
  let latestEntry = null;
  const setStar = (value) => {
    starred = Boolean(value);
    starButton.textContent = starred ? "★" : "☆";
    starButton.classList.toggle("on", starred);
    starButton.title = starred ? "Remove star" : "Star this word";
    starButton.setAttribute("aria-label", starred ? "Remove star" : "Star this word");
  };
  getHistoryEntry(word)
    .then((existing) => {
      if (alive() && existing?.starred) setStar(true);
    })
    .catch(() => {});

  copyButton.addEventListener("click", async () => {
    if (await copyText(word)) {
      copyButton.textContent = "✓";
      setTimeout(() => (copyButton.textContent = "⧉"), 900);
    }
  });

  const historyPayload = (translation, definitions) => {
    const groups = buildGroups(translation, definitions, S.tgt);
    const translations = dedupe(
      groups.flatMap((group) => group.translations || []),
    ).slice(0, 10);
    return {
      word,
      meaning: translation?.main || translations[0] || "",
      translations,
      bangla: S.tgt === "bn" ? translations : [],
      english: definitions?.data?.entries?.[0]?.defs?.[0]?.def || "",
      pos: definitions?.data?.entries?.[0]?.pos || groups.find((group) => group.pos)?.pos || "",
      source: definitions?.data?.source || "",
      tgt: S.tgt,
    };
  };
  starButton.addEventListener("click", async () => {
    const next = !starred;
    setStar(next);
    const result = await toggleStar(word, next, latestEntry || historyPayload(null, null));
    if (!alive()) return;
    if (!result?.ok) setStar(!next);
    else if (result.entry) latestEntry = result.entry;
  });

  const translation = await translationPromise;
  if (!alive()) return null;
  if (translation) renderQuickMeaning(meaningBody, translation);

  if (guessEnglish && S.src === "auto" && translation?.detected && translation.detected !== "en") {
    guessEnglish = null;
  }
  if (!guessEnglish && S.src === "auto" && translation?.detected === "en") {
    guessEnglish = word.toLowerCase();
  }
  if (!guessEnglish && S.tgt === "en" && translation?.main) {
    guessEnglish = normalizeWord(translation.main.split("\n")[0].split(",")[0]).toLowerCase();
  }

  let definitions = noDefinitions();
  if (guessEnglish) {
    definitions =
      definitionsPromise && definitionsFor === guessEnglish
        ? await definitionsPromise
        : await getDefinitions(guessEnglish).catch(noDefinitions);
    definitions.attempted = true;
  }
  if (!alive()) return null;

  const groups = buildGroups(translation, definitions.data, S.tgt);
  const route = meaningPanel.querySelector(".route");
  const detected = S.src === "auto" ? translation?.detected || "auto" : S.src;
  if (route) route.textContent = `${langName(detected)} → ${langName(S.tgt)}`;
  const sourceBadge = meaningPanel.querySelector(".source-badge");
  if (sourceBadge) {
    sourceBadge.textContent = definitions.data
      ? SOURCE_SHORT[definitions.source] || definitions.data.source
      : guessEnglish
        ? "no dictionary"
        : "translation only";
  }
  renderSenses(meaningBody, groups, translation, definitions);

  const subline = hero.querySelector(".subline-slot");
  if (subline) {
    if (guessEnglish) subline.append(pronRow(guessEnglish, definitions.data));
    const firstGroup = groups.find((group) => group.pos);
    const pos = definitions.data?.entries?.[0]?.pos || firstGroup?.pos || "";
    if (pos) {
      subline.append(el("span", { class: "pos-badge" }, pos));
      if (S.showPosBn && posBn(pos)) subline.append(el("span", { class: "pos-bn" }, posBn(pos)));
    }
  }

  const go = (nextWord) => runLookup(out, nextWord, { onWord, record });
  if (synonymsBody) {
    if (guessEnglish) {
      relatedFull(guessEnglish, "syn")
        .then((items) => alive() && renderRelated(synonymsBody, items, go))
        .catch(() => alive() && synonymsBody.replaceChildren(muted("Could not load.")));
    } else {
      synonymsBody.replaceChildren(muted("Needs an English headword."));
    }
  }
  if (antonymsBody) {
    if (guessEnglish) {
      relatedFull(guessEnglish, "ant")
        .then((items) => alive() && renderRelated(antonymsBody, items, go))
        .catch(() => alive() && antonymsBody.replaceChildren(muted("Could not load.")));
    } else {
      antonymsBody.replaceChildren(muted("Needs an English headword."));
    }
  }

  entry.append(renderFooter(word, guessEnglish));
  latestEntry = historyPayload(translation, definitions);

  if (record && S.autoSave && (translation || definitions.data)) {
    const result = await addHistory(word, latestEntry);
    if (alive() && result?.ok && result.entry) {
      latestEntry = result.entry;
      setStar(result.entry.starred);
    }
  }

  return latestEntry;
}
