/* legacy-export.js: runs under the OLD extension ID before the 2.1 reload */
(() => {
  const $ = (id) => document.getElementById(id);
  let history = [];
  let settings = {};

  function csvEscape(value) {
    return '"' + String(value ?? "").replace(/"/g, '""') + '"';
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1500);
  }

  function normalized(entry) {
    const meaning = String(entry.meaning || "").trim();
    const words = Array.isArray(entry.bangla)
      ? entry.bangla
      : meaning
        ? [meaning]
        : [];
    return {
      word: String(entry.word || "").trim(),
      meaning,
      translations: words,
      bangla: words,
      english: String(entry.english || ""),
      pos: String(entry.pos || ""),
      count: Number(entry.count) || 1,
      starred: Boolean(entry.starred),
      ts: Number(entry.ts) || Date.now(),
      firstTs: Number(entry.firstTs || entry.ts) || Date.now(),
    };
  }

  $("extId").textContent = chrome.runtime.id;

  chrome.storage.local.get(["history", "settings"]).then((data) => {
    settings = data.settings || {};
    history = (Array.isArray(data.history) ? data.history : [])
      .map(normalized)
      .filter((entry) => entry.word);
    $("count").textContent = String(history.length);
    if (!history.length) {
      $("note").classList.add("warn");
      $("note").innerHTML =
        "No history was found under this extension ID. If you already reloaded, " +
        "your old popup's CSV export is the remaining option.";
    }
    $("json").onclick = () => {
      download(
        "ielts-lookup-old-history.json",
        JSON.stringify(
          {
            app: "IELTS Lookup",
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            history,
            settings,
          },
          null,
          2,
        ),
        "application/json",
      );
    };
    $("csv").onclick = () => {
      const lines = [
        "word,meaning,english,part_of_speech,times_looked_up,starred,first_looked_up,last_looked_up",
        ...history.map((entry) =>
          [
            csvEscape(entry.word),
            csvEscape(entry.meaning),
            csvEscape(entry.english),
            csvEscape(entry.pos),
            entry.count,
            entry.starred ? 1 : 0,
            csvEscape(new Date(entry.firstTs).toISOString()),
            csvEscape(new Date(entry.ts).toISOString()),
          ].join(","),
        ),
      ];
      download(
        "ielts-lookup-old-history.csv",
        "\ufeff" + lines.join("\n"),
        "text/csv",
      );
    };
  });
})();
