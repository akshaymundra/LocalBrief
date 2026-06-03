import { marked } from "marked";
import DOMPurify from "dompurify";
import { extractPageText } from "./extract";
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
/** Chat survives banner close + reloads in this tab; new URL = fresh chat. */
const STORE_KEY = `pageChat:${location.href}`;
const KEY_TOOLTIP = "Set API key in extension settings";

interface BannerRefs {
  host: HTMLElement;
  thread: HTMLElement;
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  copyBtn: HTMLButtonElement;
  collapseBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  modelBtn: HTMLButtonElement;
  modelList: HTMLElement;
}

let refs: BannerRefs | null = null;
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
    ensureBanner();
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

// ---------------------------------------------------------------- banner UI

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }

.panel {
  position: fixed;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: min(760px, calc(100vw - 32px));
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.55;
  color: #1f2328;
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-top: none;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  animation: slideDown 0.25s ease-out;
}
@keyframes slideDown {
  from { transform: translate(-50%, -100%); opacity: 0; }
  to   { transform: translate(-50%, 0);     opacity: 1; }
}

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
.title .spark { color: #8250df; }

.dropdown { position: relative; }
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
}
.model-btn:hover { border-color: #8250df; }
.model-btn .caret { font-size: 9px; color: #59636e; }

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

.body { transition: max-height 0.25s ease, opacity 0.2s ease; max-height: 70vh; opacity: 1; overflow: hidden; display: flex; flex-direction: column; }
.body.collapsed { max-height: 0; opacity: 0; }

.thread {
  padding: 12px 16px;
  max-height: 48vh;
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
  .panel { background: #1c2128; border-color: #363b42; color: #e6edf3; box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
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
`;

function ensureBanner(): BannerRefs {
  if (refs && document.getElementById(HOST_ID)) return refs;

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="header">
      <span class="title"><span class="spark">✦</span> PageLens</span>
      <div class="dropdown">
        <button class="model-btn" title="Model"><span class="label"></span><span class="caret">▼</span></button>
        <div class="dropdown-list"></div>
      </div>
      <button class="icon-btn reset" title="Reset chat">↺</button>
      <button class="icon-btn copy" title="Copy conversation">Copy</button>
      <button class="icon-btn collapse" title="Collapse">▾</button>
      <button class="icon-btn close" title="Close (Esc)">✕</button>
    </div>
    <div class="body">
      <div class="thread"></div>
      <div class="controls">
        <input type="text" />
        <button class="send">Summarize</button>
      </div>
    </div>
  `;
  shadow.appendChild(panel);
  document.documentElement.appendChild(host);

  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector(sel) as T;

  refs = {
    host,
    thread: $(".thread"),
    input: $<HTMLInputElement>("input"),
    sendBtn: $<HTMLButtonElement>(".send"),
    copyBtn: $<HTMLButtonElement>(".copy"),
    collapseBtn: $<HTMLButtonElement>(".collapse"),
    resetBtn: $<HTMLButtonElement>(".reset"),
    modelBtn: $<HTMLButtonElement>(".model-btn"),
    modelList: $(".dropdown-list"),
  };

  initModelDropdown(shadow);

  const body = $(".body");
  refs.collapseBtn.addEventListener("click", () => {
    const collapsed = body.classList.toggle("collapsed");
    refs!.collapseBtn.textContent = collapsed ? "▸" : "▾";
  });

  $(".close").addEventListener("click", closeBanner);
  shadow.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") closeBanner();
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
    refs!.copyBtn.textContent = "Copied ✓";
    setTimeout(() => (refs!.copyBtn.textContent = "Copy"), 1500);
  });

  // Restore persisted conversation for this page (survives banner close/reload).
  turns = loadTurns();
  for (const turn of turns) {
    if (turn.role === "user") appendUserBubble(turn.display);
    else appendAssistantMarkdown(turn.display);
  }
  scrollThread();
  updateInputMode();
  return refs;
}

function closeBanner(): void {
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
  const r = ensureBanner();
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

function startStream(r: BannerRefs): void {
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
