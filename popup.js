/* popup.js: tabs, lookup, history, import/export, settings */
const $ = (id) => document.getElementById(id);
let current = "";
let historyCache = [];
let showCount = 120;
let historyFilter = "all";
let pendingImport = null;
let toastTimer = 0;

$("css").textContent = CSS;

function tab(name) {
  for (const pane of ["look", "hist", "set"]) $(pane).hidden = pane !== name;
  document
    .querySelectorAll(".tabs button")
    .forEach((button) => button.classList.toggle("on", button.dataset.tab === name));
  if (name === "hist") renderHistory();
  if (name === "set") refreshStats();
  if (name === "look") $("q").focus();
}

function renderWelcome() {
  $("out").replaceChildren(
    el(
      "div",
      { class: "welcome" },
      el("h2", {}, "Look up any word"),
      el(
        "p",
        {},
        "Select text on any page, or type above. Bangla meanings and English definitions appear together.",
      ),
    ),
  );
}

function syncSettingsUI() {
  for (const id of ["theme", "size", "src", "tgt", "dict", "accent"]) {
    if ($(id)) $(id).value = S[id];
  }
  for (const id of [
    "enabled",
    "banglaFirst",
    "showPosBn",
    "showIpa",
    "showExamples",
    "showSynonyms",
    "showAntonyms",
    "doubleClick",
    "autoSave",
    "syncMirror",
    "autoBackup",
  ]) {
    if ($(id)) $(id).checked = Boolean(S[id]);
  }
  for (const id of ["delay", "maxChars", "maxWords"]) {
    if ($(id)) $(id).value = S[id];
  }
  $("cardWidth").value = S.cardWidth;
  $("cardWidthVal").textContent = `${S.cardWidth}px`;
}

function applyAndSave() {
  applyAppearance(document.documentElement);
  saveSettings();
}

function rerunCurrent() {
  if (!current) return;
  runLookup($("out"), current, {
    record: false,
    onWord: (word) => {
      current = word;
      $("q").value = word;
    },
  });
}

function lookupWord(word) {
  const value = normalizeWord(word);
  if (!value) return;
  current = value;
  $("q").value = value;
  runLookup($("out"), value, {
    onWord: (next) => {
      current = next;
      $("q").value = next;
    },
  }).then(() => {
    renderRecent();
    refreshStats();
  });
}

async function renderRecent() {
  const history = await getHistory();
  const top = history.slice(0, 6);
  $("recent").replaceChildren(
    ...top.map((entry) =>
      el(
        "button",
        {
          class: "chip",
          type: "button",
          title: "Look up again",
          onclick: () => {
            tab("look");
            lookupWord(entry.word);
          },
        },
        el("span", { class: "chip-word" }, entry.word),
        entry.meaning
          ? el(
              "span",
              { class: "chip-tr" },
              entry.bangla?.[0] || entry.meaning,
            )
          : null,
      ),
    ),
  );
}

function historyRow(entry) {
  const meaning = entry.bangla?.length
    ? entry.bangla.slice(0, 3).join(" · ")
    : entry.meaning || "";
  const word = el(
    "button",
    {
      class: "hword",
      type: "button",
      title: "Look up again",
      onclick: () => {
        tab("look");
        lookupWord(entry.word);
      },
    },
    entry.word,
  );
  const star = el(
    "button",
    {
      class: `star${entry.starred ? " on" : ""}`,
      type: "button",
      title: entry.starred ? "Remove star" : "Star this word",
    },
    entry.starred ? "★" : "☆",
  );
  star.addEventListener("click", async () => {
    const result = await toggleStar(entry.word, !entry.starred, entry);
    if (result?.ok) {
      entry.starred = !entry.starred;
      renderHistory();
      renderRecent();
    }
  });
  const remove = el(
    "button",
    { type: "button", title: "Delete from history" },
    "✕",
  );
  remove.addEventListener("click", async () => {
    await removeHistory(entry.word);
    await renderHistory();
    await renderRecent();
    showToast(`Removed ${entry.word}.`);
  });
  return el(
    "div",
    { class: "hrow" },
    el(
      "div",
      { class: "hmain" },
      word,
      el(
        "div",
        { class: "hmean" },
        meaning ? el("span", { class: "bn" }, meaning) : null,
      ),
      entry.english ? el("div", { class: "heng" }, entry.english) : null,
    ),
    el("div", { class: "hmeta" }, `×${entry.count} · ${formatShortDate(entry.ts)}`),
    el("div", { class: "hact" }, star, remove),
  );
}

async function renderHistory() {
  historyCache = await getHistory();
  const query = $("hq").value.trim().toLowerCase();
  let rows = historyCache.filter(
    (entry) =>
      !query ||
      entry.word.toLowerCase().includes(query) ||
      (entry.meaning || "").toLowerCase().includes(query) ||
      (entry.english || "").toLowerCase().includes(query) ||
      (entry.bangla || []).some((word) => word.toLowerCase().includes(query)),
  );
  if (historyFilter === "star") rows = rows.filter((entry) => entry.starred);
  const sort = $("hsort").value;
  if (sort === "count") rows.sort((a, b) => b.count - a.count || b.ts - a.ts);
  else if (sort === "alpha") rows.sort((a, b) => a.word.localeCompare(b.word));
  else rows.sort((a, b) => b.ts - a.ts);
  const starred = historyCache.filter((entry) => entry.starred).length;
  $("hcount").textContent = `${historyCache.length} word${
    historyCache.length === 1 ? "" : "s"
  } · ${starred} starred`;
  const shown = rows.slice(0, showCount);
  const kids = [];
  let lastGroup = "";
  for (const entry of shown) {
    const label = dayLabel(entry.ts);
    if (label !== lastGroup) {
      kids.push(el("div", { class: "hgroup" }, label));
      lastGroup = label;
    }
    kids.push(historyRow(entry));
  }
  if (!shown.length) {
    kids.push(
      el(
        "div",
        { class: "empty" },
        query || historyFilter === "star"
          ? "No matching words."
          : "Nothing here yet. Look up a word to start.",
      ),
    );
  }
  $("hlist").replaceChildren(...kids);
  $("more").hidden = rows.length <= shown.length;
  $("more").textContent = `Load more (${Math.max(0, rows.length - shown.length)})`;
}

function csvEscape(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

async function exportJson() {
  const history = await getHistory();
  const payload = {
    app: "IELTS Lookup",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    history,
    settings: S,
  };
  const date = new Date().toISOString().slice(0, 10);
  downloadText(
    `ielts-lookup-history-${date}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
  showToast(`Exported ${history.length} words as JSON.`);
}

async function exportCsv() {
  const history = await getHistory();
  const lines = [
    "word,meaning,english,part_of_speech,times_looked_up,starred,first_looked_up,last_looked_up",
    ...history.map((entry) =>
      [
        csvEscape(entry.word),
        csvEscape(entry.meaning || entry.bangla?.[0] || ""),
        csvEscape(entry.english),
        csvEscape(entry.pos),
        entry.count,
        entry.starred ? 1 : 0,
        csvEscape(new Date(entry.firstTs || entry.ts).toISOString()),
        csvEscape(new Date(entry.ts).toISOString()),
      ].join(","),
    ),
  ];
  const date = new Date().toISOString().slice(0, 10);
  downloadText(
    `ielts-lookup-history-${date}.csv`,
    "\ufeff" + lines.join("\n"),
    "text/csv",
  );
  showToast(`Exported ${history.length} words as CSV.`);
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text || "").replace(/^\ufeff/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => String(cell).trim()));
}

function csvToEntries(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((cell) =>
    cell.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  const indexOf = (...names) => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const wordIndex = indexOf("word", "term");
  if (wordIndex < 0) return [];
  const meaningIndex = indexOf("meaning", "bangla", "bengali");
  const englishIndex = indexOf("english", "definition", "english_definition");
  const posIndex = indexOf("part_of_speech", "pos");
  const countIndex = indexOf("times_looked_up", "count");
  const starIndex = indexOf("starred", "star");
  const firstIndex = indexOf("first_looked_up", "first_seen", "firstts");
  const lastIndex = indexOf("last_looked_up", "last_seen", "ts", "date");
  return rows.slice(1).map((cells) => {
    const word = String(cells[wordIndex] || "").trim();
    if (!word) return null;
    const last = lastIndex >= 0 ? Date.parse(cells[lastIndex]) : NaN;
    const first = firstIndex >= 0 ? Date.parse(cells[firstIndex]) : NaN;
    return {
      word,
      meaning: meaningIndex >= 0 ? cells[meaningIndex] : "",
      english: englishIndex >= 0 ? cells[englishIndex] : "",
      pos: posIndex >= 0 ? cells[posIndex] : "",
      count: countIndex >= 0 ? Number(cells[countIndex]) || 1 : 1,
      starred:
        starIndex >= 0
          ? /^(1|true|yes|y)$/i.test(String(cells[starIndex] || "").trim())
          : false,
      ts: Number.isFinite(last) ? last : Date.now(),
      firstTs: Number.isFinite(first) ? first : Number.isFinite(last) ? last : Date.now(),
    };
  });
}

async function handleImportFile(file) {
  const text = await file.text();
  let entries = [];
  try {
    if (/\.json$/i.test(file.name) || /^[\[{]/.test(text.trim())) {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed.history || parsed.entries || [];
      entries = normalizeHistoryList(list);
    } else {
      entries = normalizeHistoryList(csvToEntries(text));
    }
  } catch {
    entries = [];
  }
  if (!entries.length) {
    showToast("No valid words found in that file.");
    return;
  }
  pendingImport = entries;
  $("importInfo").textContent = `Found ${entries.length} word${
    entries.length === 1 ? "" : "s"
  }. Merge keeps your current history and combines duplicates; Replace swaps the whole list (an undo copy is kept).`;
  $("importDlg").showModal();
}

async function doImport(mode) {
  if (!pendingImport) return;
  const result = await importHistory(pendingImport, mode);
  pendingImport = null;
  $("importDlg").close();
  if (!result?.ok) {
    showToast(result?.error || "Import failed.");
    return;
  }
  await renderHistory();
  await renderRecent();
  refreshStats();
  showToast(
    `${mode === "replace" ? "Replaced" : "Merged"} history: ${result.count} words.`,
  );
}

async function refreshStats() {
  const stats = await getStats();
  if (!stats?.ok) return;
  const backup = stats.backupMeta;
  $("backupInfo").textContent = backup?.lastTs
    ? `Last backup: ${new Date(backup.lastTs).toLocaleString()} · ${backup.count || 0} words`
    : "No automatic backup yet.";
  $("statsLine").textContent = `${stats.count} words · ${
    stats.starred
  } starred · ${formatBytes(stats.bytes)} stored · sync mirror ${
    stats.syncCount ? `${stats.syncCount} words` : "empty"
  }`;
}

function showToast(message, actionLabel, actionFn) {
  $("toastMsg").textContent = message;
  const action = $("toastAction");
  if (actionLabel) {
    action.hidden = false;
    action.textContent = actionLabel;
    action.onclick = async () => {
      hideToast();
      await actionFn();
    };
  } else {
    action.hidden = true;
  }
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, actionLabel ? 12000 : 4500);
}

function hideToast() {
  $("toast").hidden = true;
}

async function init() {
  await sendBg("migrate");
  await loadSettings();
  applyAppearance(document.documentElement);

  for (const [code, name] of Object.entries(LANGS)) {
    $("src").append(new Option(name, code));
    if (code !== "auto") $("tgt").append(new Option(name, code));
  }
  syncSettingsUI();

  document
    .querySelectorAll(".tabs button")
    .forEach((button) =>
      button.addEventListener("click", () => tab(button.dataset.tab)),
    );

  $("form").addEventListener("submit", (event) => {
    event.preventDefault();
    lookupWord($("q").value);
  });
  $("q").addEventListener("focus", () => $("q").select());

  $("quickTheme").addEventListener("click", () => {
    const order = ["auto", "light", "dark"];
    S.theme = order[(order.indexOf(S.theme) + 1) % order.length];
    $("theme").value = S.theme;
    applyAndSave();
  });

  for (const id of ["theme", "size", "src", "tgt", "dict", "accent"]) {
    $(id).addEventListener("change", () => {
      S[id] = $(id).value;
      applyAndSave();
      if (["src", "tgt", "dict", "accent"].includes(id)) rerunCurrent();
    });
  }

  $("cardWidth").addEventListener("input", () => {
    $("cardWidthVal").textContent = `${$("cardWidth").value}px`;
  });
  $("cardWidth").addEventListener("change", () => {
    S.cardWidth = Number($("cardWidth").value) || 400;
    $("cardWidthVal").textContent = `${S.cardWidth}px`;
    applyAndSave();
  });

  for (const id of [
    "banglaFirst",
    "showPosBn",
    "showIpa",
    "showExamples",
    "showSynonyms",
    "showAntonyms",
  ]) {
    $(id).addEventListener("change", () => {
      S[id] = $(id).checked;
      applyAndSave();
      rerunCurrent();
    });
  }
  for (const id of ["enabled", "doubleClick", "autoSave", "syncMirror", "autoBackup"]) {
    $(id).addEventListener("change", () => {
      S[id] = $(id).checked;
      applyAndSave();
      if (id === "syncMirror") {
        if (S.syncMirror) {
          mirrorHistoryNow().then(refreshStats);
        } else {
          refreshStats();
        }
      }
      if (id === "autoBackup") refreshStats();
    });
  }
  for (const id of ["delay", "maxChars", "maxWords"]) {
    $(id).addEventListener("change", () => {
      S[id] = Number($(id).value);
      syncSettingsUI();
      applyAndSave();
    });
  }

  $("swap").addEventListener("click", () => {
    if (S.src === "auto") return;
    [S.src, S.tgt] = [S.tgt, S.src];
    syncSettingsUI();
    applyAndSave();
    rerunCurrent();
  });

  $("hq").addEventListener("input", () => {
    showCount = 120;
    renderHistory();
  });
  $("hsort").addEventListener("change", () => {
    showCount = 120;
    renderHistory();
  });
  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      historyFilter = button.dataset.filter;
      document
        .querySelectorAll(".filter")
        .forEach((item) => item.classList.toggle("on", item === button));
      showCount = 120;
      renderHistory();
    });
  });
  $("more").addEventListener("click", () => {
    showCount += 120;
    renderHistory();
  });

  $("expJson").addEventListener("click", exportJson);
  $("expCsv").addEventListener("click", exportCsv);
  $("impBtn").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", async () => {
    const file = $("file").files?.[0];
    $("file").value = "";
    if (file) await handleImportFile(file);
  });
  $("importCancel").addEventListener("click", () => $("importDlg").close());
  $("importMerge").addEventListener("click", () => doImport("merge"));
  $("importReplace").addEventListener("click", () => doImport("replace"));

  $("hclear").addEventListener("click", async () => {
    const count = (await getHistory()).length;
    if (!count) return showToast("History is already empty.");
    $("clearInfo").textContent = `Delete all ${count} word${
      count === 1 ? "" : "s"
    } from history? A copy is kept so you can Undo.`;
    $("clearDlg").showModal();
  });
  $("clearCancel").addEventListener("click", () => $("clearDlg").close());
  $("clearConfirm").addEventListener("click", async () => {
    $("clearDlg").close();
    const result = await clearHistory();
    await renderHistory();
    await renderRecent();
    refreshStats();
    if (result?.ok) {
      showToast(`Cleared ${result.count} words.`, "Undo", async () => {
        await undoClearHistory();
        await renderHistory();
        await renderRecent();
        refreshStats();
        showToast("History restored.");
      });
    }
  });

  $("backupNow").addEventListener("click", async () => {
    const result = await backupNow();
    refreshStats();
    if (result?.ok) showToast(`Backup saved: ${result.count} words.`);
    else if (result?.skipped) showToast("Nothing to back up yet.");
    else showToast(`Backup failed: ${result?.error || "unknown error"}`);
  });
  $("cacheClear").addEventListener("click", async () => {
    const result = await clearCache();
    refreshStats();
    showToast(
      `Cleared ${result?.count || 0} cached lookups. History is untouched.`,
    );
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.history && !$("hist").hidden) renderHistory();
    if (changes.settings) {
      S = { ...DEFAULTS, ...(changes.settings.newValue || {}) };
      syncSettingsUI();
      applyAppearance(document.documentElement);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")
    ) {
      event.preventDefault();
      tab("look");
      $("q").focus();
    }
  });

  renderWelcome();
  renderRecent();
  renderHistory();
  refreshStats();
}

init();
