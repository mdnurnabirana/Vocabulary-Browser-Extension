// Fetches run here because web pages can't call these sites directly (CORS).
const ALLOWED = new Set([
  "translate.googleapis.com",
  "api.dictionaryapi.dev",
  "api.datamuse.com",
  "dictionary.cambridge.org",
  "www.oxfordlearnersdictionaries.com",
]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || msg?.type !== "fetch") return;
  (async () => {
    try {
      const u = new URL(msg.url);
      if (u.protocol !== "https:" || !ALLOWED.has(u.hostname))
        throw new Error("blocked host");
      const r = await fetch(u, { credentials: "omit" });
      if (!r.ok) return sendResponse({ ok: false, status: r.status });
      sendResponse({
        ok: true,
        data: msg.as === "json" ? await r.json() : await r.text(),
      });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // keep the channel open for the async response
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "lookup-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "lookup-now" }).catch(() => {});
  }
});