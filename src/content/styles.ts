/** Static styles + icons for the drawer shell. Settings CSS lives with the settings module. */

export const COPY_ICON = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="9" height="9" rx="1.5"/><path d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V2.5A1.5 1.5 0 0 1 2.5 1H9a1.5 1.5 0 0 1 1.5 1.5v1"/></svg>`;

/** Speaker glyph for the per-message "read aloud" button. */
export const SPEAK_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 2.5 4.5 5.5H2v5h2.5l4 3z"/><path class="wave" d="M11 5.5a3.5 3.5 0 0 1 0 5"/><path class="wave" d="M12.8 3.5a6 6 0 0 1 0 9"/></svg>`;
/** Stop (square) glyph shown while a message is playing. */
export const STOP_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>`;

export const DRAWER_CSS = `
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
/* Narrow drawer: drop the wordmark, keep the logo. */
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
.title .logo, .peek .logo { width: 18px; height: 18px; display: block; flex-shrink: 0; }

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
  flex-shrink: 0;
}
.icon-btn:hover { background: rgba(0, 0, 0, 0.07); color: #1f2328; }
.icon-btn.active { background: rgba(130, 80, 223, 0.12); color: #8250df; }
.icon-btn svg { display: block; }

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

.speak {
  margin-top: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #59636e;
  padding: 3px 7px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font: inherit;
  font-size: 11.5px;
}
.speak:hover { background: rgba(0, 0, 0, 0.07); color: #1f2328; }
.speak.playing { color: #8250df; }
.speak svg { display: block; }
.speak.playing .wave { animation: speakPulse 1.1s ease-in-out infinite; }
@keyframes speakPulse { 50% { opacity: 0.25; } }

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
  .speak { color: #9198a1; }
  .speak:hover { background: rgba(255, 255, 255, 0.08); color: #e6edf3; }
  .speak.playing { color: #a371f7; }
}
`;
