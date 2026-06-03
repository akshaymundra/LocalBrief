import { getDrawerWidth } from "../storage";
import { SETTINGS_CSS } from "./settings-panel";
import { COPY_ICON, DRAWER_CSS } from "./styles";

export const HOST_ID = "ollama-summary-host";

/** Handles to the interactive elements inside the drawer. */
export interface DrawerRefs {
  body: HTMLElement;
  chat: HTMLElement;
  thread: HTMLElement;
  input: HTMLInputElement;
  sendBtn: HTMLButtonElement;
  copyBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  settingsBtn: HTMLButtonElement;
  collapseBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
  modelBtn: HTMLButtonElement;
  modelList: HTMLElement;
}

export interface Drawer {
  refs: DrawerRefs;
  shadow: ShadowRoot;
  /** The .drawer element (resize + collapse target). */
  element: HTMLElement;
  /** Left-edge resize handle. */
  handle: HTMLElement;
  /** Edge tab shown while collapsed. */
  peek: HTMLElement;
  setCollapsed(collapsed: boolean): void;
  remove(): void;
}

/**
 * Builds the drawer DOM shell (shadow host, header, body, peek tab) and
 * appends it to the page. Pure view — behavior wiring happens in the entry.
 */
export function createDrawer(): Drawer {
  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = DRAWER_CSS + SETTINGS_CSS;
  shadow.appendChild(style);

  const logo = `<img class="logo" src="${chrome.runtime.getURL("icons/icon48.png")}" alt="" />`;

  const element = document.createElement("div");
  element.className = "drawer";
  element.innerHTML = `
    <div class="header">
      <span class="title">${logo}<span class="name">PageLens</span></span>
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
  shadow.appendChild(element);

  // Edge tab shown while the drawer is collapsed — lives outside the drawer
  // so it stays visible when the drawer slides off-screen.
  const peek = document.createElement("button");
  peek.className = "peek";
  peek.title = "Open PageLens";
  peek.innerHTML = logo;
  shadow.appendChild(peek);

  document.documentElement.appendChild(host);

  // Restore the user's preferred width (persisted across pages).
  void getDrawerWidth().then((w) => element.style.setProperty("--drawer-width", `${w}px`));

  const $ = <T extends HTMLElement>(sel: string) => element.querySelector(sel) as T;

  const refs: DrawerRefs = {
    body: $(".body"),
    chat: $(".chat"),
    thread: $(".thread"),
    input: $<HTMLInputElement>("input"),
    sendBtn: $<HTMLButtonElement>(".send"),
    copyBtn: $<HTMLButtonElement>(".copy"),
    resetBtn: $<HTMLButtonElement>(".reset"),
    settingsBtn: $<HTMLButtonElement>(".settings-toggle"),
    collapseBtn: $<HTMLButtonElement>(".collapse"),
    closeBtn: $<HTMLButtonElement>(".close"),
    modelBtn: $<HTMLButtonElement>(".model-btn"),
    modelList: $(".dropdown-list"),
  };

  return {
    refs,
    shadow,
    element,
    handle: $(".resize-handle"),
    peek,
    // Collapse slides the drawer off-screen; DOM stays mounted so chat,
    // scroll and settings state survive. The peek tab restores it as-is.
    setCollapsed(collapsed) {
      element.classList.toggle("collapsed", collapsed);
      peek.classList.toggle("visible", collapsed);
    },
    remove() {
      host.remove();
    },
  };
}
