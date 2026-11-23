const $ = (id) => document.getElementById(id);
let current = "";

$("css").textContent = CSS;

function tab(name) {
  for (const t of ["look", "hist", "set"]) $(t).hidden = t !== name;
  document
    .querySelectorAll(".tabs button")
    .forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  if (name === "hist") renderHistory();
  if (name === "look") $("q").focus();
}

function lookupWord(word) {
  $("q").value = word;
  runLookup($("out"), word, { onWord: (w) => (current = w) });
}

async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  const f = $("hq").value.trim().toLowerCase();
  const rows = history.filter(
    (h) =>
      !f ||
      h.word.toLowerCase().includes(f) ||
      (h.meaning || "").toLowerCase().includes(f),
  );
  $("hcount").textContent =
    `${history.length} word${history.length === 1 ? "" : "s"}`;
  const shown = rows.slice(0, 300);
  const kids = shown.map((h) =>
    el(
      "div",
      { class: "hrow" },
      el(
        "button",
        {
          class: "link",
          onclick: () => {
            tab("look");
            lookupWord(h.word);
          },
        },
        h.word,
      ),
      el("span", { class: "m muted" }, h.meaning || ""),
      el(
        "span",
        { class: "muted" },
        `×${h.count} · ${new Date(h.ts).toLocaleDateString()}`,
      ),
      el(
        "button",
        {
          title: "Delete",
          onclick: async () => {
            await removeHistory(h.word);
            renderHistory();
          },
        },
        "✕",
      ),
    ),
  );
  if (!kids.length) kids.push(muted("Nothing here yet."));
  if (rows.length > shown.length)
    kids.push(
      muted(`Showing the latest ${shown.length}. Search to narrow it down.`),
    );
  $("hlist").replaceChildren(...kids);
}

async function exportCsv() {
  const { history = [] } = await chrome.storage.local.get("history");
  const q = (s) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
  const csv =
    "\ufeff" +
    [
      "word,meaning,times looked up,last looked up",
      ...history.map((h) =>
        [
          q(h.word),
          q(h.meaning),
          h.count,
          q(new Date(h.ts).toISOString()),
        ].join(","),
      ),
    ].join("\n");
  el("a", {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: "ielts-history.csv",
  }).click();
}

(async function init() {
  await loadSettings();

  document
    .querySelectorAll(".tabs button")
    .forEach((b) => (b.onclick = () => tab(b.dataset.tab)));

  // Lookup tab
  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    lookupWord($("q").value);
  });
  $("q").focus();

  // History tab
  $("hq").addEventListener("input", renderHistory);
  $("exp").onclick = exportCsv;
  $("hclear").onclick = async () => {
    if (confirm("Delete your whole lookup history?")) {
      await chrome.storage.local.set({ history: [] });
      renderHistory();
    }
  };

  // Settings tab
  for (const [c, n] of Object.entries(LANGS)) {
    $("src").append(new Option(n, c));
    if (c !== "auto") $("tgt").append(new Option(n, c));
  }
  const fields = ["src", "tgt", "dict", "accent"];
  const sync = () => {
    for (const id of fields) $(id).value = S[id];
    $("enabled").checked = S.enabled;
    $("delay").value = S.delay;
  };
  const changed = () => {
    saveSettings();
    if (current)
      runLookup($("out"), current, {
        record: false,
        onWord: (w) => (current = w),
      });
  };
  sync();
  for (const id of fields)
    $(id).addEventListener("change", () => {
      S[id] = $(id).value;
      changed();
    });
  $("enabled").onchange = () => {
    S.enabled = $("enabled").checked;
    saveSettings();
  };
  $("delay").onchange = () => {
    S.delay = Math.min(10, Math.max(0.5, Number($("delay").value) || 3));
    $("delay").value = S.delay;
    saveSettings();
  };
  $("swap").onclick = () => {
    if (S.src === "auto") return;
    [S.src, S.tgt] = [S.tgt, S.src];
    sync();
    changed();
  };
  $("clr").onclick = async () => {
    const keys = Object.keys(await chrome.storage.local.get(null)).filter((k) =>
      k.startsWith("c:"),
    );
    await chrome.storage.local.remove(keys);
    $("clr").textContent = `Cleared ${keys.length}`;
    setTimeout(() => ($("clr").textContent = "Clear saved lookups"), 1500);
  };
})();