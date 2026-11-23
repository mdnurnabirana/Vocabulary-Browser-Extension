/* content.js: watches selection and shows the bilingual card after the delay */
(() => {
  let host = null;
  let shadow = null;
  let card = null;
  let body = null;
  let timer = 0;
  let mouseDown = false;
  let inCard = false;
  let lastSelection = null;

  async function loadFonts() {
    const faces = [
      ["IELTS UI", "fonts/inter-latin.woff2"],
      ["IELTS Bangla", "fonts/noto-sans-bengali.woff2"],
    ];
    for (const [family, file] of faces) {
      try {
        const face = new FontFace(
          family,
          `url("${chrome.runtime.getURL(file)}") format("woff2")`,
          { weight: "400 700", style: "normal", display: "swap" },
        );
        document.fonts.add(await face.load());
      } catch {
        try {
          const fallback = new FontFace(
            family,
            `url("${chrome.runtime.getURL(file)}") format("woff2")`,
            { weight: "normal", style: "normal", display: "swap" },
          );
          document.fonts.add(await fallback.load());
        } catch {}
      }
    }
  }

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("ielts-lookup-card");
    host.style.cssText =
      "all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;";
    shadow = host.attachShadow({ mode: "closed" });
    applyAppearance(host);
    card = el(
      "div",
      {
        class: "card",
        hidden: "",
        role: "dialog",
        "aria-label": "IELTS Lookup",
      },
      el(
        "div",
        { class: "card-top" },
        el(
          "span",
          { class: "brand" },
          el("span", { class: "brand-dot" }),
          "IELTS Lookup",
        ),
        el(
          "button",
          { class: "icon-btn", type: "button", title: "Close (Esc)", onclick: hide },
          "✕",
        ),
      ),
      (body = el("div", { class: "card-body", "aria-live": "polite" })),
    );
    shadow.append(el("style", {}, CSS), card);
    document.documentElement.append(host);
  }

  function selectionInfo() {
    const selection = getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    if (
      host &&
      (selection.anchorNode === host || host.contains(selection.anchorNode))
    )
      return null;
    const active = document.activeElement;
    if (
      active &&
      (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
    )
      return null;
    const text = selection.toString().trim().replace(/\s+/g, " ");
    if (!text || text.length > (S.maxChars || 60)) return null;
    if (text.split(" ").length > (S.maxWords || 6)) return null;
    if (!/\p{L}/u.test(text)) return null;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return { text, rect };
  }

  function place(info) {
    if (!card) return;
    const width = Math.min(Number(S.cardWidth) || 400, innerWidth - 16);
    const below = innerHeight - info.rect.bottom;
    const above = info.rect.top;
    const placeBelow = below >= 280 || below >= above;
    const x = Math.max(8, Math.min(info.rect.left, innerWidth - width - 8)) + scrollX;
    card.style.left = x + "px";
    card.style.maxHeight =
      Math.max(180, Math.min(560, (placeBelow ? below : above) - 16)) + "px";
    if (placeBelow) {
      card.style.top = info.rect.bottom + scrollY + 8 + "px";
      card.style.transform = "";
    } else {
      card.style.top = info.rect.top + scrollY - 8 + "px";
      card.style.transform = "translateY(-100%)";
    }
  }

  function hide() {
    clearTimeout(timer);
    if (card) card.hidden = true;
    if (body) body._t = (body._t || 0) + 1;
    inCard = false;
  }

  function show(info) {
    clearTimeout(timer);
    ensureHost();
    applyAppearance(host);
    inCard = false;
    lastSelection = info;
    place(info);
    card.hidden = false;
    card.setAttribute("aria-label", `IELTS Lookup: ${info.text}`);
    runLookup(body, info.text, {
      onWord: (word) => card.setAttribute("aria-label", `IELTS Lookup: ${word}`),
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (!S.enabled || mouseDown || inCard) return;
    const info = selectionInfo();
    if (!info) return;
    timer = setTimeout(
      () => {
        const now = selectionInfo();
        if (S.enabled && now && now.text === info.text && !mouseDown) show(now);
      },
      Math.max(0.3, Number(S.delay) || 3) * 1000,
    );
  }

  async function init() {
    await loadSettings();
    loadFonts();
    document.addEventListener("selectionchange", schedule);
    document.addEventListener(
      "mousedown",
      (event) => {
        mouseDown = true;
        inCard = Boolean(host && event.composedPath().includes(host));
        if (!inCard) hide();
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
      (event) => {
        if (event.key === "Escape") hide();
      },
      true,
    );
    document.addEventListener(
      "dblclick",
      () => {
        if (!S.enabled || !S.doubleClick) return;
        setTimeout(() => {
          const info = selectionInfo();
          if (info) show(info);
        }, 20);
      },
      true,
    );
    window.addEventListener("resize", () => {
      if (card && !card.hidden && lastSelection) place(lastSelection);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.settings && host) {
        applyAppearance(host);
      }
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== "lookup-now") return;
      const info = selectionInfo();
      if (info) show(info);
    });
  }

  init();
})();
