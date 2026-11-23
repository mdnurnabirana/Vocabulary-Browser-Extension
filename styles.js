/* styles.js: shared design tokens and components for the card and popup */
const CSS = `
:host, :root {
  --font-ui: "IELTS UI", "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
  --font-bn: "IELTS Bangla", "Noto Sans Bengali", "Nirmala UI", "Shonar Bangla", sans-serif;
  --bg: #fbfbfd;
  --bg-soft: #f4f5f9;
  --panel: #ffffff;
  --panel-2: #f6f7fb;
  --fg: #18191f;
  --muted: #646b7a;
  --faint: #8a90a0;
  --line: #e3e6ed;
  --line-strong: #d2d7e2;
  --accent: #4f46e5;
  --accent-strong: #4338ca;
  --accent-soft: #eef0ff;
  --accent-fg: #ffffff;
  --warn: #b45309;
  --gold: #d97706;
  --shadow: 0 18px 50px rgba(22, 27, 45, .2), 0 2px 8px rgba(22, 27, 45, .06);
  --radius: 16px;
  --base: 14.5px;
  --bn-size: 20px;
  --line-height: 1.55;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])), :root:not([data-theme="light"]) {
    --bg: #14151a;
    --bg-soft: #191b22;
    --panel: #1c1e26;
    --panel-2: #22252f;
    --fg: #edeff6;
    --muted: #a4aaba;
    --faint: #7e8597;
    --line: #2b2f3b;
    --line-strong: #3b4152;
    --accent: #8f90ff;
    --accent-strong: #a7a8ff;
    --accent-soft: #26264a;
    --accent-fg: #121319;
    --warn: #f0b36a;
    --gold: #fbbf24;
    --shadow: 0 18px 50px rgba(0, 0, 0, .55), 0 2px 8px rgba(0, 0, 0, .35);
    color-scheme: dark;
  }
}
:host([data-theme="dark"]), :root[data-theme="dark"] {
  --bg: #14151a;
  --bg-soft: #191b22;
  --panel: #1c1e26;
  --panel-2: #22252f;
  --fg: #edeff6;
  --muted: #a4aaba;
  --faint: #7e8597;
  --line: #2b2f3b;
  --line-strong: #3b4152;
  --accent: #8f90ff;
  --accent-strong: #a7a8ff;
  --accent-soft: #26264a;
  --accent-fg: #121319;
  --warn: #f0b36a;
  --gold: #fbbf24;
  --shadow: 0 18px 50px rgba(0, 0, 0, .55), 0 2px 8px rgba(0, 0, 0, .35);
  color-scheme: dark;
}
:host([data-size="compact"]), :root[data-size="compact"] { --base: 13.5px; --bn-size: 18px; }
:host([data-size="large"]), :root[data-size="large"] { --base: 15.5px; --bn-size: 22px; }

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
::selection { background: var(--accent-soft); color: var(--fg); }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
input, select, textarea {
  font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line);
  border-radius: 9px; padding: 6px 9px; min-width: 0; outline: none;
}
input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
input[type="checkbox"] { accent-color: var(--accent); width: 15px; height: 15px; padding: 0; }
input[type="file"] { padding: 4px; }
label { cursor: pointer; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  padding: 6px 10px; border: 1px solid var(--line); border-radius: 9px;
  background: var(--bg); color: var(--fg); font-size: 12.5px; font-weight: 600; white-space: nowrap;
}
.btn:hover { border-color: var(--accent); color: var(--accent); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
.btn.primary:hover { filter: brightness(1.06); color: var(--accent-fg); }
.btn.danger:hover { border-color: #dc2626; color: #dc2626; }
.btn.destructive { background: #dc2626; border-color: #dc2626; color: #fff; }
.btn.destructive:hover { background: #b91c1c; border-color: #b91c1c; color: #fff; }
.btn:disabled { opacity: .45; cursor: default; }

/* The floating card */
.card {
  position: absolute; top: 0; left: 0;
  width: min(var(--card-w, 400px), calc(100vw - 16px));
  max-height: min(560px, calc(100vh - 24px));
  overflow: auto; overscroll-behavior: contain;
  background: var(--bg); color: var(--fg);
  border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-family: var(--font-ui); font-size: var(--base); line-height: var(--line-height);
  text-align: left; animation: card-in .16s ease-out;
}
.card[hidden] { display: none; }
.card-top {
  position: sticky; top: 0; z-index: 3;
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; background: var(--bg); border-bottom: 1px solid var(--line);
}
.card-top .brand { flex: 1; }
.card-body { min-height: 40px; }
@keyframes card-in { from { opacity: 0; } to { opacity: 1; } }

.brand { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: .075em; text-transform: uppercase; color: var(--muted); }
.brand-dot { width: 8px; height: 8px; border-radius: 3px; background: linear-gradient(135deg, var(--accent), #a855f7); }

/* Entry */
.entry { padding: 14px; }
.hero { display: block; }
.word-row { display: flex; align-items: flex-start; gap: 10px; }
.word {
  margin: 0; flex: 1; min-width: 0; font-size: 27px; line-height: 1.14;
  font-weight: 650; letter-spacing: -.025em; overflow-wrap: anywhere;
}
.word.bn { font-family: var(--font-bn); font-size: 26px; line-height: 1.4; letter-spacing: 0; }
.hero-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.icon-btn {
  width: 30px; height: 30px; border-radius: 9px; border: 1px solid transparent;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--muted); font-size: 16px; line-height: 1; transition: background .12s, color .12s;
}
.icon-btn:hover { background: var(--panel-2); color: var(--fg); border-color: var(--line); }
.icon-btn.star.on { color: var(--gold); }
.subline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 7px; }
.ipa { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.pron-btn {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: 999px; border: 1px solid var(--line); background: var(--panel);
  font-size: 11.5px; color: var(--muted);
}
.pron-btn:hover { border-color: var(--accent); color: var(--accent); }
.pos-badge {
  display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 6px;
  background: var(--accent-soft); color: var(--accent-strong);
  font-size: 10.5px; font-weight: 700; letter-spacing: .015em;
}
.pos-bn { font-family: var(--font-bn); font-size: 12.5px; color: var(--muted); font-weight: 500; }

/* Panels */
.panel { margin-top: 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); overflow: hidden; }
.panel-head {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  padding: 9px 12px; border-bottom: 1px solid var(--line); background: var(--panel-2);
}
.panel-title { margin: 0; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.route { font-size: 10.5px; color: var(--faint); }
.source-badge {
  margin-left: auto; font-size: 10px; font-weight: 600; color: var(--muted);
  background: var(--bg); border: 1px solid var(--line); border-radius: 999px;
  padding: 1px 7px; white-space: nowrap;
}
.panel-body { padding: 11px 12px; }

/* Bilingual meaning blocks */
.sense-group + .sense-group { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); }
.sense-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 5px; }
.tr-line { display: flex; align-items: flex-start; gap: 8px; margin: 5px 0 7px; }
.tr-label {
  flex: 0 0 auto; padding-top: 4px; font-size: 10px; font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--faint);
}
.bn-list { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.bn-chip {
  display: inline-flex; align-items: center; text-align: left;
  font-family: var(--font-bn); font-size: var(--bn-size); line-height: 1.65;
  font-weight: 500; letter-spacing: 0; color: var(--fg);
  background: var(--accent-soft); border: 1px solid transparent;
  border-radius: 8px; padding: 1px 7px;
}
.bn-chip:hover { border-color: var(--accent); }
.bn-chip.copied { background: var(--accent); color: var(--accent-fg); }
.bn { font-family: var(--font-bn); font-size: var(--bn-size); line-height: 1.75; letter-spacing: 0; font-weight: 500; }

/* Definitions */
.defs { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }
.def-item { display: flex; gap: 7px; align-items: flex-start; }
.def-num {
  flex: 0 0 auto; min-width: 17px; height: 17px; margin-top: 2px;
  border-radius: 5px; background: var(--panel-2); color: var(--muted);
  font-size: 10.5px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.def-text { font-size: var(--base); line-height: 1.55; color: var(--fg); }
.examples { margin: 4px 0 0; display: grid; gap: 2px; }
.ex {
  border-left: 2px solid var(--line-strong); padding: 1px 0 1px 8px;
  color: var(--muted); font-size: calc(var(--base) - 1px); line-height: 1.45;
}

/* Chips */
.chip-row { display: flex; flex-wrap: wrap; gap: 5px; }
.chip {
  display: inline-flex; align-items: baseline; gap: 5px; max-width: 100%;
  border: 1px solid var(--line); background: var(--bg); border-radius: 999px;
  padding: 3px 9px; font-size: 12.5px; color: var(--fg); text-align: left;
}
.chip:hover { border-color: var(--accent); background: var(--accent-soft); }
.chip-word { font-weight: 600; }
.chip-tr { font-family: var(--font-bn); font-size: 12px; font-weight: 400; color: var(--muted); white-space: normal; }

.muted { color: var(--muted); font-size: 13px; }
.note { color: var(--warn); font-size: 12px; line-height: 1.45; margin-top: 8px; }
.empty { color: var(--muted); font-size: 13px; padding: 2px 0; }
.foot { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; padding: 11px 2px 0; color: var(--faint); font-size: 11.5px; }
.foot a { color: var(--muted); font-weight: 600; }
.foot a:hover { color: var(--accent); }
.link-btn { color: var(--muted); font-weight: 600; font-size: 11.5px; }
.link-btn:hover { color: var(--accent); }

/* Loading */
.skeleton { display: grid; gap: 7px; padding: 2px 0; }
.sk-line {
  height: 10px; border-radius: 5px;
  background: linear-gradient(90deg, var(--panel-2), var(--line), var(--panel-2));
  background-size: 200% 100%; animation: shimmer 1.3s ease-in-out infinite;
}
.sk-line.w85 { width: 85%; } .sk-line.w70 { width: 70%; } .sk-line.w45 { width: 45%; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

@media (max-width: 480px) {
  .entry { padding: 12px; }
  .word { font-size: 24px; }
  .word.bn { font-size: 23px; }
  .panel-body { padding: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
