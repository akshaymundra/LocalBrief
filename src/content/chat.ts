import { getUseEmbeddings } from "../storage";
import type { RuntimeCommand } from "../types";
import type { AutoScroller } from "./autoscroll";
import type { ChatStore } from "./chat-store";
import type { DrawerRefs } from "./drawer";
import type { ModelDropdown } from "./dropdown";
import { renderMarkdown } from "./markdown";
import { createPageContext } from "./page-context";
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
  const pageContext = createPageContext(location.href);

  let streamingMarkdown = "";
  let streamingEl: HTMLElement | null = null;
  let renderQueued = false;
  let preparing = false; // building context (may await embeddings) before stream starts

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

  /**
   * Build the page-context for `query` (null = initial summary), merge it into
   * the first user message, and start streaming. Async because hybrid
   * retrieval may await embeddings.
   */
  async function startStream(query: string | null): Promise<void> {
    preparing = true;
    streamingMarkdown = "";
    scroller.engage(); // user just sent a message — they want to see the reply
    refs.sendBtn.disabled = true;

    const el = document.createElement("div");
    el.className = "msg assistant";
    el.innerHTML = `<div class="thinking">Thinking<span class="dots"></span></div>`;
    streamingEl = el;
    refs.thread.appendChild(el);
    scroller.scrollToBottom();

    try {
      const provider = dropdown.selected();
      const pageBlock = await pageContext.buildContext(query, provider, await getUseEmbeddings());
      // Cancelled mid-prepare (drawer closed, or chat reset) — bail before
      // touching a torn-down UI or firing a stale request.
      if (streamingEl !== el) return;
      // Page context rides on the first user message (keeps Anthropic's strict
      // user/assistant alternation). The request leads and the page follows, so
      // a first-turn instruction is obeyed rather than auto-summarized; the
      // reminder also curbs link/figure hallucination.
      const messages = store.toMessages();
      if (messages.length) {
        messages[0] = {
          ...messages[0],
          content:
            `${messages[0].content}\n\n` +
            `Use the PAGE CONTENT below to answer the request above. ` +
            `If something (e.g. a link or figure) is not present in it, say so — do not invent it.\n\n` +
            pageBlock,
        };
      }
      stream.start(provider, messages, { onChunk, onDone, onError });
    } catch {
      if (streamingEl === el) onError("Couldn't prepare the page content — try again.", false);
    } finally {
      preparing = false;
    }
  }

  // ----------------------------------------------------------------- public

  function submit(): void {
    if (stream.isStreaming() || preparing) return;

    const inputText = refs.input.value.trim();
    const isFirst = store.isEmpty();

    if (isFirst && !pageContext.hasContent()) {
      appendError("No readable text found on this page.", false);
      return;
    }

    if (!isFirst && !inputText) return; // Ask mode needs a question

    // `request` drives retrieval/framing; null only when the first turn is a
    // bare "Summarize" (empty box) → whole-page summary.
    const request = inputText || null;
    const text = inputText || "Summarize this page.";

    store.push({ role: "user", content: text, display: text });
    appendUserBubble(text);
    refs.input.value = "";
    void startStream(request);
  }

  function teardown(): void {
    stream.abort();
    streamingEl = null;
    streamingMarkdown = "";
    pageContext.dispose(); // free cached page text + in-memory embeddings
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
