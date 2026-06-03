import { extractPageText } from "../extract";
import type { RuntimeCommand } from "../types";
import type { AutoScroller } from "./autoscroll";
import type { ChatStore } from "./chat-store";
import type { DrawerRefs } from "./drawer";
import type { ModelDropdown } from "./dropdown";
import { renderMarkdown } from "./markdown";
import type { StreamClient } from "./stream";

/**
 * Chat controller: submit flow, streaming view state, and thread rendering.
 * Transport state lives in StreamClient; turns live in ChatStore.
 */
export interface ChatController {
  submit(): void;
  reset(): void;
  /** Replay persisted turns into the thread (call once after creation). */
  restore(): void;
  /** Abort any in-flight stream and drop streaming view state. */
  teardown(): void;
}

export function createChatController(deps: {
  refs: DrawerRefs;
  store: ChatStore;
  scroller: AutoScroller;
  stream: StreamClient;
  dropdown: ModelDropdown;
}): ChatController {
  const { refs, store, scroller, stream, dropdown } = deps;

  let streamingMarkdown = "";
  let streamingEl: HTMLElement | null = null;
  let renderQueued = false;

  /** Empty thread → Summarize mode; afterwards → Ask mode. */
  function updateInputMode(): void {
    if (store.isEmpty()) {
      refs.sendBtn.textContent = "Summarize";
      refs.input.placeholder = "Optional instructions — e.g. “3 bullets only”, “focus on pricing”…";
    } else {
      refs.sendBtn.textContent = "Ask";
      refs.input.placeholder = "Ask a question about this page…";
    }
  }

  // ------------------------------------------------------- thread rendering

  function appendUserBubble(text: string): void {
    const div = document.createElement("div");
    div.className = "msg user";
    div.textContent = text;
    refs.thread.appendChild(div);
    scroller.scrollToBottom();
  }

  function appendAssistantMarkdown(markdown: string): void {
    const div = document.createElement("div");
    div.className = "msg assistant";
    div.innerHTML = renderMarkdown(markdown);
    refs.thread.appendChild(div);
  }

  function appendError(message: string, openSettings: boolean): void {
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
    scroller.scrollToBottom();
  }

  function renderStreaming(withCursor: boolean): void {
    if (!streamingEl) return;
    const html = renderMarkdown(streamingMarkdown);
    streamingEl.innerHTML = withCursor ? html + `<span class="cursor"></span>` : html;
    scroller.follow();
  }

  // -------------------------------------------------------------- streaming

  function onChunk(token: string): void {
    streamingMarkdown += token;
    // Throttle to one render per animation frame — tokens can arrive dozens
    // of times a second and a full markdown re-render per token causes
    // reflow jank while the user is scrolling.
    if (!renderQueued) {
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        if (stream.isStreaming()) renderStreaming(true);
      });
    }
  }

  function onDone(): void {
    refs.sendBtn.disabled = false;
    if (streamingMarkdown) {
      store.push({ role: "assistant", content: streamingMarkdown, display: streamingMarkdown });
      renderStreaming(false);
    } else {
      streamingEl?.remove();
    }
    streamingEl = null;
    updateInputMode();
    refs.input.focus();
  }

  function onError(message: string, openSettings: boolean): void {
    refs.sendBtn.disabled = false;
    streamingEl?.remove();
    streamingEl = null;
    appendError(message, openSettings);
  }

  function startStream(): void {
    streamingMarkdown = "";
    scroller.engage(); // user just sent a message — they want to see the reply
    refs.sendBtn.disabled = true;

    streamingEl = document.createElement("div");
    streamingEl.className = "msg assistant";
    streamingEl.innerHTML = `<div class="thinking">Thinking<span class="dots"></span></div>`;
    refs.thread.appendChild(streamingEl);
    scroller.scrollToBottom();

    stream.start(dropdown.selected(), store.toMessages(), { onChunk, onDone, onError });
  }

  // ----------------------------------------------------------------- public

  function submit(): void {
    if (stream.isStreaming()) return;

    const inputText = refs.input.value.trim();

    let content: string;
    let display: string;
    if (store.isEmpty()) {
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

    store.push({ role: "user", content, display });
    appendUserBubble(display);
    refs.input.value = "";
    startStream();
  }

  function teardown(): void {
    stream.abort();
    streamingEl = null;
    streamingMarkdown = "";
  }

  function reset(): void {
    teardown();
    store.clear();
    refs.thread.replaceChildren();
    refs.sendBtn.disabled = false;
    refs.input.value = "";
    updateInputMode();
    refs.input.focus();
  }

  function restore(): void {
    for (const turn of store.turns) {
      if (turn.role === "user") appendUserBubble(turn.display);
      else appendAssistantMarkdown(turn.display);
    }
    scroller.scrollToBottom();
    updateInputMode();
  }

  return { submit, reset, restore, teardown };
}
