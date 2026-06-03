import { marked } from "marked";
import DOMPurify from "dompurify";
import { extractPageText } from "./extract";
import { SETTINGS_CSS, createSettingsPanel } from "./settings-panel";
import { DRAWER_WIDTH_RANGE, getDrawerWidth, setDrawerWidth } from "./storage";
import {
  PORT_NAME,
  PROVIDERS,
  type ChatMessage,
  type ChatRequest,
  type ProviderId,
  type ProviderStatus,
  type RuntimeCommand,
  type StoredTurn,
  type StreamMessage,
} from "./types";

marked.setOptions({ gfm: true, breaks: true });

const HOST_ID = "ollama-summary-host";
/** Keep page-context message (index 0) + the most recent turns. */
const MAX_HISTORY = 20;
/** Chat survives drawer close + reloads in this tab; new URL = fresh chat. */
const STORE_KEY = `pageChat:${location.href}`;
const KEY_TOOLTIP = "Set API key in extension settings";
const COPY_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="9" height="9" rx="1.5"/><path d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V2.5A1.5 1.5 0 0 1 2.5 1H9a1.5 1.5 0 0 1 1.5 1.5v1"/></svg>`;

interface DrawerRefs {
  host: HTMLElement;
  thread: HTMLElement;
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  copyBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  modelBtn: HTMLButtonElement;
  modelList: HTMLElement;
}

let refs: DrawerRefs | null = null;
let port: chrome.runtime.Port | null = null;
let turns: StoredTurn[] = [];
let selectedProvider: ProviderId = "ollama";
let streamingMarkdown = "";
let streamingEl: HTMLElement | null = null;
let streaming = false;
/** Autoscroll follow-state: any upward user gesture disengages; returning to bottom re-engages. */
let autoFollow = true;
let programmaticScroll = false;
let lastScrollTop = 0;
let renderQueued = false;

chrome.runtime.onMessage.addListener((msg: RuntimeCommand) => {
  if (msg.type === "OPEN_BANNER") {
    ensureDrawer();
    refs?.input.focus();
  }
});

// ----------------------------------------------------------- persistence

function saveTurns(): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(turns));
  } catch {
    // Quota/serialization failure — chat still works, just won't survive close.
  }
}

function loadTurns(): StoredTurn[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredTurn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearStoredTurns(): void {
  sessionStorage.removeItem(STORE_KEY);
}

// ---------------------------------------------------------------- drawer UI

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }

.drawer {
  position: fixed;
  top: 0; right: 0;
  height: 100vh;
  width: min(var(--drawer-width, 400px), calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.55;
  color: #1f2328;
  background: #ffffff;
  border-left: 1px solid #d0d7de;
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.18);
  animation: slideIn 0.25s ease-out;
  transition: transform 0.25s ease;
  container-type: inline-size;
}
/* Narrow drawer: drop the wordmark, keep the ✦ icon. */
@container (max-width: 379px) {
  .title .name { display: none; }
}
/* Collapsed: slid fully off-screen. DOM stays mounted so chat, scroll and
   settings state survive; the peek tab restores it unchanged. */
.drawer.collapsed { transform: translateX(100%); box-shadow: none; }
.drawer.resizing { transition: none; }
@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

.resize-handle {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 6px;
  cursor: ew-resize;
  touch-action: none;
}
.resize-handle:hover, .drawer.resizing .resize-handle { background: rgba(130, 80, 223, 0.35); }

.peek {
  position: fixed;
  right: 0; top: 50%;
  transform: translateY(-50%);
  z-index: 2147483647;
  display: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  color: #8250df;
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-right: none;
  border-radius: 8px 0 0 8px;
  padding: 10px 8px;
  cursor: pointer;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
}
.peek.visible { display: block; }

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f6f8fa;
  border-bottom: 1px solid #d0d7de;
  border-radius: 0;
}
.title { font-weight: 600; font-size: 13px; flex: 1; display: flex; align-items: center; gap: 6px; }
.title .logo { width: 18px; height: 18px; display: block; flex-shrink: 0; }

.dropdown { position: relative; min-width: 0; }
.model-btn {
  font: inherit;
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #ffffff;
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
}
.model-btn:hover { border-color: #8250df; }
.model-btn .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.model-btn .caret { font-size: 9px; color: #59636e; flex-shrink: 0; }

.dropdown-list {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 4px;
  z-index: 10;
}
.dropdown-list.open { display: block; }

.dropdown-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.dropdown-item:hover { background: rgba(130, 80, 223, 0.1); }
.dropdown-item .check { width: 14px; color: #8250df; font-weight: 700; }
.dropdown-item.disabled { color: #8c959f; cursor: not-allowed; }
.dropdown-item.disabled:hover { background: rgba(0, 0, 0, 0.04); }
.dropdown-item.disabled .lock { margin-left: auto; font-size: 11px; }

.dropdown-item .tooltip {
  display: none;
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: #1f2328;
  color: #ffffff;
  font-size: 11.5px;
  padding: 5px 9px;
  border-radius: 6px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
.dropdown-item .tooltip::after {
  content: "";
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 5px solid transparent;
  border-left-color: #1f2328;
}
.dropdown-item.disabled:hover .tooltip { display: block; }

.icon-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: #59636e;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: inherit;
  transition: background 0.15s;
}
.icon-btn:hover { background: rgba(0, 0, 0, 0.07); color: #1f2328; }
.icon-btn.active { background: rgba(130, 80, 223, 0.12); color: #8250df; }
.icon-btn svg { display: block; }
.icon-btn { flex-shrink: 0; }

.body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.chat[hidden] { display: none; }

.thread {
  padding: 12px 16px;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.thread:empty { padding: 0; }

.msg.user {
  align-self: flex-end;
  max-width: 85%;
  background: #8250df;
  color: #ffffff;
  padding: 7px 12px;
  border-radius: 14px 14px 4px 14px;
  white-space: pre-wrap;
  font-size: 13.5px;
}
.msg.assistant {
  align-self: stretch;
  font-size: 14px;
}
.msg.assistant h1, .msg.assistant h2, .msg.assistant h3 { font-size: 15px; margin: 12px 0 6px; }
.msg.assistant p { margin: 8px 0; }
.msg.assistant p:first-child { margin-top: 0; }
.msg.assistant ul, .msg.assistant ol { margin: 8px 0; padding-left: 22px; }
.msg.assistant li { margin: 4px 0; }
.msg.assistant code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  background: rgba(129, 139, 152, 0.15);
  padding: 1px 5px;
  border-radius: 4px;
}
.msg.assistant pre { background: rgba(129, 139, 152, 0.12); padding: 10px; border-radius: 8px; overflow-x: auto; margin: 8px 0; }
.msg.assistant pre code { background: none; padding: 0; }
.msg.assistant a { color: #8250df; }
.msg.assistant blockquote { border-left: 3px solid #d0d7de; padding-left: 12px; color: #59636e; margin: 8px 0; }

.cursor {
  display: inline-block;
  width: 3px; height: 1em;
  background: #8250df;
  vertical-align: text-bottom;
  margin-left: 2px;
  animation: blink 1s steps(1) infinite;
}
@keyframes blink { 50% { opacity: 0; } }

.thinking { color: #59636e; font-size: 13px; }
.thinking .dots::after { content: ""; animation: dots 1.4s steps(4, end) infinite; }
@keyframes dots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75% { content: "..."; } }

.error {
  color: #d1242f;
  background: rgba(209, 36, 47, 0.07);
  border: 1px solid rgba(209, 36, 47, 0.25);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  white-space: pre-wrap;
}
.error .settings-link {
  display: inline-block;
  margin-top: 8px;
  font: inherit;
  font-weight: 600;
  color: #8250df;
  background: transparent;
  border: 1px solid #8250df;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
.error .settings-link:hover { background: rgba(130, 80, 223, 0.1); }

.controls { display: flex; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid rgba(208, 215, 222, 0.6); }
.thread:empty + .controls { border-top: none; }
.controls input {
  flex: 1;
  font: inherit;
  font-size: 13px;
  padding: 7px 11px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #ffffff;
  color: inherit;
  outline: none;
}
.controls input:focus { border-color: #8250df; box-shadow: 0 0 0 3px rgba(130, 80, 223, 0.15); }
.controls input::placeholder { color: #8c959f; }
.controls button {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  background: #8250df;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.controls button:hover { background: #6e40c9; }
.controls button:disabled { opacity: 0.6; cursor: default; }

@media (prefers-color-scheme: dark) {
  .drawer { background: #1c2128; border-color: #363b42; color: #e6edf3; box-shadow: -8px 0 28px rgba(0,0,0,0.5); }
  .peek { background: #1c2128; border-color: #363b42; box-shadow: -4px 0 12px rgba(0,0,0,0.5); }
  .header { background: #22272e; border-color: #363b42; }
  .icon-btn, .thinking, .model-btn .caret { color: #9198a1; }
  .icon-btn:hover { background: rgba(255,255,255,0.08); color: #e6edf3; }
  .model-btn { background: #161b22; border-color: #363b42; }
  .dropdown-list { background: #1c2128; border-color: #363b42; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
  .dropdown-item.disabled { color: #6e7681; }
  .dropdown-item.disabled:hover { background: rgba(255, 255, 255, 0.04); }
  .dropdown-item .tooltip { background: #e6edf3; color: #1f2328; }
  .dropdown-item .tooltip::after { border-left-color: #e6edf3; }
  .controls { border-color: rgba(54, 59, 66, 0.8); }
  .controls input { background: #161b22; border-color: #363b42; }
  .msg.assistant blockquote { border-color: #363b42; color: #9198a1; }
  .error { color: #ff8182; }
}
${SETTINGS_CSS}
`;

function ensureDrawer(): DrawerRefs {
  if (refs && document.getElementById(HOST_ID)) return refs;

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const drawer = document.createElement("div");
  drawer.className = "drawer";
  drawer.innerHTML = `
    <div class="header">
      <span class="title"><img class="logo" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="" /><span class="name">PageLens</span></span>
      <div class="dropdown">
        <button class="model-btn" title="Model"><span class="label"></span><span class="caret">▼</span></button>
        <div class="dropdown-list"></div>
      </div>
      <button class="icon-btn reset" title="Reset chat">↺</button>
      <button class="icon-btn copy" title="Copy conversation">${COPY_ICON}</button>
      <button class="icon-btn settings-toggle" title="Settings">⚙</button>
      <button class="icon-btn collapse" title="Collapse">»</button>
      <button class="icon-btn close" title="Close (Esc)">✕</button>
    </div>
    <div class="body">
      <div class="chat">
        <div class="thread"></div>
        <div class="controls">
          <input type="text" />
          <button class="send">Summarize</button>
        </div>
      </div>
    </div>
    <div class="resize-handle"></div>
  `;
  shadow.appendChild(drawer);

  // Edge tab shown while the drawer is collapsed — lives outside the drawer
  // so it stays visible when the drawer slides off-screen.
  const peek = document.createElement("button");
  peek.className = "peek";
  peek.title = "Open PageLens";
  peek.innerHTML = `<img class="logo" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="" width="18" height="18" style="display:block" />`;
  shadow.appendChild(peek);

  document.documentElement.appendChild(host);

  const $ = <T extends HTMLElement>(sel: string) => drawer.querySelector(sel) as T;

  refs = {
    host,
    thread: $(".thread"),
    input: $<HTMLInputElement>("input"),
    sendBtn: $<HTMLButtonElement>(".send"),
    copyBtn: $<HTMLButtonElement>(".copy"),
    resetBtn: $<HTMLButtonElement>(".reset"),
    modelBtn: $<HTMLButtonElement>(".model-btn"),
    modelList: $(".dropdown-list"),
  };

  initModelDropdown(shadow);
  initResize(drawer, $(".resize-handle"));

  // Restore the user's preferred width (persisted across pages).
  void getDrawerWidth().then((w) => drawer.style.setProperty("--drawer-width", `${w}px`));

  // Settings panel shares the body with the chat; ⚙ swaps between them.
  const settings = createSettingsPanel();
  $(".body").appendChild(settings.el);
  const chat = $(".chat");
  const settingsBtn = $<HTMLButtonElement>(".settings-toggle");
  const toggleSettings = (open = !settings.isOpen()): void => {
    if (open) settings.open();
    else settings.close();
    chat.hidden = open;
    settingsBtn.classList.toggle("active", open);
  };
  settingsBtn.addEventListener("click", () => toggleSettings());

  // Collapse slides the drawer off-screen; the peek tab restores it as-is.
  const setCollapsed = (collapsed: boolean): void => {
    drawer.classList.toggle("collapsed", collapsed);
    peek.classList.toggle("visible", collapsed);
  };
  $(".collapse").addEventListener("click", () => setCollapsed(true));
  peek.addEventListener("click", () => {
    setCollapsed(false);
    refs?.input.focus();
  });

  $(".close").addEventListener("click", closeDrawer);
  shadow.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Escape") return;
    if (settings.isOpen()) toggleSettings(false);
    else closeDrawer();
  });

  // Follow-state tracking. Direction-based: ANY upward movement disengages
  // (even 1px — slow trackpad scrolls must never be fought); re-engage only
  // when the user lands back at the very bottom.
  refs.thread.addEventListener(
    "wheel",
    (e) => {
      if (e.deltaY < 0) autoFollow = false;
    },
    { passive: true },
  );
  refs.thread.addEventListener("scroll", () => {
    if (!refs) return;
    const top = refs.thread.scrollTop;
    if (programmaticScroll) {
      lastScrollTop = top; // our own scroll — record, don't interpret
      return;
    }
    if (top < lastScrollTop) {
      autoFollow = false; // user moved up (trackpad, scrollbar, touch)
    } else if (refs.thread.scrollHeight - top - refs.thread.clientHeight <= 2) {
      autoFollow = true; // user landed at the bottom — resume following
    }
    lastScrollTop = top;
  });

  refs.resetBtn.addEventListener("click", resetChat);
  refs.sendBtn.addEventListener("click", submit);
  refs.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  refs.copyBtn.addEventListener("click", async () => {
    if (!turns.length) return;
    const md = turns
      .map((t) => `## ${t.role === "user" ? "You" : "Assistant"}\n\n${t.display}`)
      .join("\n\n");
    await navigator.clipboard.writeText(md);
    refs!.copyBtn.textContent = "✓";
    setTimeout(() => (refs!.copyBtn.innerHTML = COPY_ICON), 1500);
  });

  // Restore persisted conversation for this page (survives drawer close/reload).
  turns = loadTurns();
  for (const turn of turns) {
    if (turn.role === "user") appendUserBubble(turn.display);
    else appendAssistantMarkdown(turn.display);
  }
  scrollThread();
  updateInputMode();
  return refs;
}

function closeDrawer(): void {
  port?.disconnect();
  port = null;
  streaming = false;
  streamingEl = null;
  refs?.host.remove();
  refs = null;
  // turns stay in sessionStorage — restored on reopen.
}

function resetChat(): void {
  port?.disconnect();
  port = null;
  streaming = false;
  streamingEl = null;
  turns = [];
  clearStoredTurns();
  if (refs) {
    refs.thread.replaceChildren();
    refs.sendBtn.disabled = false;
    refs.input.value = "";
    updateInputMode();
    refs.input.focus();
  }
}

/** Empty thread → Summarize mode; afterwards → Ask mode. */
function updateInputMode(): void {
  if (!refs) return;
  if (turns.length === 0) {
    refs.sendBtn.textContent = "Summarize";
    refs.input.placeholder = "Optional instructions — e.g. “3 bullets only”, “focus on pricing”…";
  } else {
    refs.sendBtn.textContent = "Ask";
    refs.input.placeholder = "Ask a question about this page…";
  }
}

// ------------------------------------------------------------------ resize

const clampWidth = (px: number): number =>
  Math.min(DRAWER_WIDTH_RANGE.max, Math.max(DRAWER_WIDTH_RANGE.min, px));

/** Drag the drawer's left edge to resize; the final width persists across pages. */
function initResize(drawer: HTMLElement, handle: HTMLElement): void {
  let startX = 0;
  let startWidth = 0;
  let width = 0;

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    startX = e.clientX;
    width = startWidth = drawer.getBoundingClientRect().width;
    drawer.classList.add("resizing"); // kill the transform transition while dragging
  });
  handle.addEventListener("pointermove", (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    width = clampWidth(startWidth + (startX - e.clientX));
    drawer.style.setProperty("--drawer-width", `${width}px`);
  });
  const endDrag = (e: PointerEvent): void => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    drawer.classList.remove("resizing");
    void setDrawerWidth(width);
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}

// ----------------------------------------------------------- model dropdown

function providerLabel(id: ProviderId): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

async function fetchProviderStatus(): Promise<ProviderStatus> {
  try {
    const cmd: RuntimeCommand = { type: "GET_PROVIDER_STATUS" };
    return (await chrome.runtime.sendMessage(cmd)) as ProviderStatus;
  } catch {
    return { ollama: true, anthropic: false, openai: false };
  }
}

function initModelDropdown(shadow: ShadowRoot): void {
  if (!refs) return;
  const { modelBtn, modelList } = refs;

  const setLabel = () => {
    (modelBtn.querySelector(".label") as HTMLElement).textContent =
      providerLabel(selectedProvider);
  };

  const renderList = (status: ProviderStatus) => {
    modelList.replaceChildren();
    for (const p of PROVIDERS) {
      const usable = status[p.id];
      const item = document.createElement("div");
      item.className = "dropdown-item" + (usable ? "" : " disabled");
      item.innerHTML = `
        <span class="check">${p.id === selectedProvider ? "✓" : ""}</span>
        <span>${p.label}</span>
        ${usable ? "" : `<span class="lock">🔒</span><span class="tooltip">${KEY_TOOLTIP}</span>`}
      `;
      item.addEventListener("click", () => {
        if (usable) {
          selectedProvider = p.id;
          setLabel();
          modelList.classList.remove("open");
        } else {
          // Shortcut: jump straight to settings to add the key.
          const cmd: RuntimeCommand = { type: "OPEN_OPTIONS" };
          void chrome.runtime.sendMessage(cmd);
        }
      });
      modelList.appendChild(item);
    }
  };

  modelBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (modelList.classList.contains("open")) {
      modelList.classList.remove("open");
      return;
    }
    // Refresh on every open — keys may have been added/expired meanwhile.
    renderList(await fetchProviderStatus());
    modelList.classList.add("open");
  });

  shadow.addEventListener("click", (e) => {
    if (!modelList.contains(e.target as Node) && e.target !== modelBtn) {
      modelList.classList.remove("open");
    }
  });
  shadow.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") modelList.classList.remove("open");
  });

  // Initial selection: stored default, falling back to ollama if its key is gone.
  void (async () => {
    const [{ defaultModel }, status] = await Promise.all([
      chrome.storage.local.get("defaultModel"),
      fetchProviderStatus(),
    ]);
    const wanted = (defaultModel as ProviderId | undefined) ?? "ollama";
    selectedProvider =
      PROVIDERS.some((p) => p.id === wanted) && status[wanted] ? wanted : "ollama";
    setLabel();
  })();

  setLabel();
}

// ------------------------------------------------------------------- chat

function submit(): void {
  const r = ensureDrawer();
  if (streaming) return;

  const inputText = r.input.value.trim();

  let content: string;
  let display: string;
  if (turns.length === 0) {
    // First turn: embed page context once.
    const pageText = extractPageText();
    if (!pageText) {
      appendError("No readable text found on this page.", false);
      return;
    }
    const ask = inputText || "Summarize this page.";
    content = `Title: ${document.title}\nURL: ${location.href}\n\nContent:\n${pageText}\n\n${ask}`;
    display = ask;
  } else {
    if (!inputText) return; // Ask mode needs a question
    content = inputText;
    display = inputText;
  }

  turns.push({ role: "user", content, display });
  saveTurns();
  appendUserBubble(display);
  r.input.value = "";
  startStream(r);
}

function toMessages(allTurns: StoredTurn[]): ChatMessage[] {
  const messages = allTurns.map(({ role, content }) => ({ role, content }));
  if (messages.length <= MAX_HISTORY) return messages;
  // Pin the page-context message; keep the most recent turns.
  return [messages[0], ...messages.slice(messages.length - (MAX_HISTORY - 1))];
}

function startStream(r: DrawerRefs): void {
  port?.disconnect();
  port = null;

  streaming = true;
  streamingMarkdown = "";
  autoFollow = true; // user just sent a message — they want to see the reply
  r.sendBtn.disabled = true;

  streamingEl = document.createElement("div");
  streamingEl.className = "msg assistant";
  streamingEl.innerHTML = `<div class="thinking">Thinking<span class="dots"></span></div>`;
  r.thread.appendChild(streamingEl);
  scrollThread();

  port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener(onStreamMessage);
  port.onDisconnect.addListener(() => {
    if (streaming) finishStream();
  });

  const req: ChatRequest = {
    type: "CHAT",
    provider: selectedProvider,
    messages: toMessages(turns),
  };
  port.postMessage(req);
}

function onStreamMessage(msg: StreamMessage): void {
  if (!refs) return;
  switch (msg.type) {
    case "CHUNK":
      streamingMarkdown += msg.token;
      // Throttle to one render per animation frame — tokens can arrive dozens
      // of times a second and a full markdown re-render per token causes
      // reflow jank while the user is scrolling.
      if (!renderQueued) {
        renderQueued = true;
        requestAnimationFrame(() => {
          renderQueued = false;
          if (streaming) renderStreaming(true);
        });
      }
      break;
    case "DONE":
      finishStream();
      break;
    case "ERROR":
      streaming = false;
      refs.sendBtn.disabled = false;
      streamingEl?.remove();
      streamingEl = null;
      appendError(msg.message, msg.openSettings ?? false);
      break;
  }
}

function finishStream(): void {
  streaming = false;
  if (!refs) return;
  refs.sendBtn.disabled = false;
  if (streamingMarkdown) {
    turns.push({ role: "assistant", content: streamingMarkdown, display: streamingMarkdown });
    saveTurns();
    renderStreaming(false);
  } else {
    streamingEl?.remove();
  }
  streamingEl = null;
  updateInputMode();
  refs.input.focus();
}

function renderStreaming(withCursor: boolean): void {
  if (!streamingEl) return;
  const html = DOMPurify.sanitize(marked.parse(streamingMarkdown) as string);
  streamingEl.innerHTML = withCursor ? html + `<span class="cursor"></span>` : html;
  // Follow the stream only while engaged — never fight an upward scroll.
  if (autoFollow) scrollThread();
}


function appendUserBubble(text: string): void {
  if (!refs) return;
  const div = document.createElement("div");
  div.className = "msg user";
  div.textContent = text;
  refs.thread.appendChild(div);
  scrollThread();
}

function appendAssistantMarkdown(markdown: string): void {
  if (!refs) return;
  const div = document.createElement("div");
  div.className = "msg assistant";
  div.innerHTML = DOMPurify.sanitize(marked.parse(markdown) as string);
  refs.thread.appendChild(div);
}

function appendError(message: string, openSettings: boolean): void {
  if (!refs) return;
  const div = document.createElement("div");
  div.className = "error";
  div.textContent = message;
  if (openSettings) {
    const btn = document.createElement("button");
    btn.className = "settings-link";
    btn.textContent = "Open settings";
    btn.addEventListener("click", () => {
      const cmd: RuntimeCommand = { type: "OPEN_OPTIONS" };
      void chrome.runtime.sendMessage(cmd);
    });
    div.appendChild(document.createElement("br"));
    div.appendChild(btn);
  }
  refs.thread.appendChild(div);
  scrollThread();
}

function scrollThread(): void {
  if (!refs) return;
  programmaticScroll = true;
  refs.thread.scrollTop = refs.thread.scrollHeight;
  requestAnimationFrame(() => {
    programmaticScroll = false;
  });
}
