import { createAutoScroller } from "./content/autoscroll";
import { createChatController, type ChatController } from "./content/chat";
import { createChatStore } from "./content/chat-store";
import { createDrawer, HOST_ID, type Drawer } from "./content/drawer";
import { createModelDropdown } from "./content/dropdown";
import { initResize } from "./content/resize";
import { createSettingsPanel } from "./content/settings-panel";
import { createStreamClient } from "./content/stream";
import { COPY_ICON } from "./content/styles";
import type { RuntimeCommand } from "./types";

/** Chat survives drawer close + reloads in this tab; new URL = fresh chat. */
const STORE_KEY = `pageChat:${location.href}`;

let ui: { drawer: Drawer; chat: ChatController } | null = null;

chrome.runtime.onMessage.addListener((msg: RuntimeCommand) => {
  if (msg.type === "OPEN_BANNER") {
    ensureDrawer();
    ui?.drawer.refs.input.focus();
  }
});

/** Builds the drawer once and wires the modules together; idempotent. */
function ensureDrawer(): void {
  if (ui && document.getElementById(HOST_ID)) return;

  const drawer = createDrawer();
  const { refs, shadow } = drawer;

  const store = createChatStore(STORE_KEY);
  const scroller = createAutoScroller(refs.thread);
  scroller.attach();
  const stream = createStreamClient();
  const dropdown = createModelDropdown(shadow, refs.modelBtn, refs.modelList);
  initResize(drawer.element, drawer.handle);

  // Settings panel shares the body with the chat; ⚙ swaps between them.
  const settings = createSettingsPanel();
  refs.body.appendChild(settings.el);
  const toggleSettings = (open = !settings.isOpen()): void => {
    if (open) settings.open();
    else settings.close();
    refs.chat.hidden = open;
    refs.settingsBtn.classList.toggle("active", open);
  };
  refs.settingsBtn.addEventListener("click", () => toggleSettings());

  const chat = createChatController({ refs, store, scroller, stream, dropdown });

  refs.collapseBtn.addEventListener("click", () => drawer.setCollapsed(true));
  drawer.peek.addEventListener("click", () => {
    drawer.setCollapsed(false);
    refs.input.focus();
  });

  refs.closeBtn.addEventListener("click", closeDrawer);
  shadow.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Escape") return;
    if (settings.isOpen()) toggleSettings(false);
    else closeDrawer();
  });

  refs.resetBtn.addEventListener("click", chat.reset);
  refs.sendBtn.addEventListener("click", chat.submit);
  refs.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") chat.submit();
  });

  refs.copyBtn.addEventListener("click", async () => {
    if (!store.turns.length) return;
    const md = store.turns
      .map((t) => `## ${t.role === "user" ? "You" : "Assistant"}\n\n${t.display}`)
      .join("\n\n");
    await navigator.clipboard.writeText(md);
    refs.copyBtn.textContent = "✓";
    setTimeout(() => (refs.copyBtn.innerHTML = COPY_ICON), 1500);
  });

  chat.restore();
  ui = { drawer, chat };
}

function closeDrawer(): void {
  if (!ui) return;
  ui.chat.teardown(); // aborts any in-flight stream
  ui.drawer.remove();
  ui = null;
  // turns stay in sessionStorage — restored on reopen.
}
