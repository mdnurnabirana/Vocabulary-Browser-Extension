/* content.js: watches your selection and shows the card after the delay */
(() => {
  const MAX_CHARS = 40,
    MAX_WORDS = 4,
    W = 380;
  let host, card, body, titleEl;
  let timer = 0,
    mouseDown = false,
    inCard = false;

  const CARD_CSS = `
.wrap{font:14px/1.5 system-ui,"Noto Sans Bengali","Nirmala UI",sans-serif;color:var(--fg);text-align:left}
.card{position:absolute;width:min(${W}px,calc(100vw - 16px));overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:10px}
.card[hidden]{display:none}
.head{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.title{flex:1;font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

  function selectionInfo() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    if (host && sel.anchorNode === host) return null; // selection inside our own card
    const a = document.activeElement;
    // never read or send what you are typing
    if (
      a &&
      (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
    )
      return null;
    const text = sel.toString().trim().replace(/\s+/g, " ");
    if (!text || text.length > MAX_CHARS || text.split(" ").length > MAX_WORDS)
      return null;
    if (!/\p{L}/u.test(text)) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return { text, rect };
  }

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("ielts-lookup-card");
    host.style.cssText =
      "all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "closed" }); // page scripts can't peek inside
    titleEl = el("span", { class: "title" }, "");
    body = el("div", {});
    card = el(
      "div",
      { class: "wrap card", hidden: "" },
      el(
        "div",
        { class: "head" },
        titleEl,
        el("button", { title: "Close (Esc)", onclick: hide }, "✕"),
      ),
      body,
    );
    shadow.append(el("style", {}, CSS + CARD_CSS), card);
    document.documentElement.append(host);
  }

  function hide() {
    if (card) card.hidden = true;
    if (body) body._t = (body._t || 0) + 1; // cancel any lookup still loading
    inCard = false;
  }

  function show({ text, rect }) {
    ensureHost();
    inCard = false;
    const below = innerHeight - rect.bottom,
      above = rect.top;
    const placeBelow = below >= 260 || below >= above;
    const x = Math.max(Math.min(rect.left, innerWidth - W - 8), 8) + scrollX;
    card.style.left = x + "px";
    if (placeBelow) {
      card.style.top = rect.bottom + scrollY + 8 + "px";
      card.style.transform = "";
      card.style.maxHeight = Math.max(160, Math.min(460, below - 16)) + "px";
    } else {
      card.style.top = rect.top + scrollY - 8 + "px";
      card.style.transform = "translateY(-100%)"; // grows upward from the word
      card.style.maxHeight = Math.max(160, Math.min(460, above - 16)) + "px";
    }
    card.hidden = false;
    runLookup(body, text, { onWord: (w) => (titleEl.textContent = w) });
  }

  function schedule() {
    clearTimeout(timer);
    if (!S.enabled || mouseDown || inCard) return;
    const info = selectionInfo();
    if (!info) return;
    timer = setTimeout(
      () => {
        const now = selectionInfo();
        if (now && now.text === info.text && !mouseDown) show(now);
      },
      Math.max(0.3, Number(S.delay) || 3) * 1000,
    );
  }

  loadSettings();
  document.addEventListener("selectionchange", schedule);
  document.addEventListener(
    "mousedown",
    (e) => {
      mouseDown = true;
      inCard = !!host && e.composedPath().includes(host);
      if (!inCard) hide(); // clicking elsewhere closes the card
    },
    true,
  );
  document.addEventListener(
    "mouseup",
    () => {
      mouseDown = false;
      setTimeout(schedule, 0);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") hide();
    },
    true,
  );

  // Alt+Shift+D: look up right now
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.type !== "lookup-now") return;
    const info = selectionInfo();
    if (info) show(info);
  });
})();