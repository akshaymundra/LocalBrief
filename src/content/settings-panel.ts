import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TEMPERATURE,
  MAX_TOKENS_RANGE,
  TEMPERATURE_RANGE,
  EMBED_MODEL,
  TTS_RATE_RANGE,
  getDefaultModel,
  getModelParams,
  getSystemPrompt,
  getTtsPrefs,
  getUseEmbeddings,
  setDefaultModel,
  setModelParams,
  setSystemPrompt,
  setTtsRate,
  setTtsVoice,
  setUseEmbeddings,
} from "../storage";
import { PROVIDERS, type ProviderId, type RuntimeCommand } from "../types";
import { isTtsSupported, listEnglishVoices } from "./tts";

/**
 * In-drawer settings panel. Edits the same chrome.storage.local values as the
 * options page — EXCEPT API keys, which must never enter the page context;
 * the "Manage API keys" button hands off to the options page instead.
 *
 * Every control auto-saves on change; values are re-read after save so the
 * UI reflects clamping (temperature/max-tokens) and defaulting (empty prompt).
 */

export const SETTINGS_CSS = `
.settings { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 16px; }
.settings[hidden] { display: none; }
.settings .heading { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; }
.settings .flash { font-size: 12px; font-weight: 400; color: #1a7f37; opacity: 0; transition: opacity 0.2s; }
.settings .flash.show { opacity: 1; }
.settings .field { display: flex; flex-direction: column; gap: 5px; }
.settings .field[hidden] { display: none; }
.settings label { font-size: 12.5px; font-weight: 600; }
.settings .hint { font-size: 11.5px; color: #59636e; }
.settings select, .settings input[type="number"], .settings textarea {
  font: inherit;
  font-size: 13px;
  padding: 6px 10px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #ffffff;
  color: inherit;
  outline: none;
}
.settings select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 30px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%238c959f' stroke-width='1.5' stroke-linecap='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
.settings select:focus, .settings input:focus, .settings textarea:focus {
  border-color: #8250df;
  box-shadow: 0 0 0 3px rgba(130, 80, 223, 0.15);
}
.settings textarea { resize: vertical; min-height: 90px; }
.settings input[type="range"] { accent-color: #8250df; }
.settings input[type="checkbox"] { accent-color: #8250df; width: 15px; height: 15px; }
.settings .temp-value, .settings .rate-value { font-weight: 400; color: #59636e; }
.settings .toggle-row { display: flex; align-items: center; gap: 8px; }
.settings .toggle-row label { font-size: 12.5px; font-weight: 600; cursor: pointer; }
.settings code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  background: rgba(129, 139, 152, 0.18);
  padding: 1px 5px;
  border-radius: 4px;
}
.settings .setup-hint[hidden] { display: none; }
.settings .link-btn {
  align-self: flex-start;
  font: inherit;
  font-size: 12px;
  color: #8250df;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}
.settings .link-btn:hover { text-decoration: underline; }
.settings .keys-btn {
  align-self: flex-start;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: #8250df;
  background: transparent;
  border: 1px solid #8250df;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
}
.settings .keys-btn:hover { background: rgba(130, 80, 223, 0.1); }

@media (prefers-color-scheme: dark) {
  .settings .hint, .settings .temp-value, .settings .rate-value { color: #9198a1; }
  .settings .flash { color: #3fb950; }
  .settings select, .settings input[type="number"], .settings textarea { background: #161b22; border-color: #363b42; }
}
`;

export interface SettingsPanel {
  el: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
}

export function createSettingsPanel(): SettingsPanel {
  const el = document.createElement("div");
  el.className = "settings";
  el.hidden = true;
  el.innerHTML = `
    <div class="heading">Settings <span class="flash">Saved ✓</span></div>
    <div class="field">
      <label>Default model</label>
      <select class="model"></select>
      <span class="hint">Model the drawer starts with — switch anytime from the header.</span>
    </div>
    <div class="field">
      <label>Temperature <span class="temp-value"></span></label>
      <input class="temperature" type="range"
        min="${TEMPERATURE_RANGE.min}" max="${TEMPERATURE_RANGE.max}" step="0.1" />
      <span class="hint">Lower = more factual, higher = more creative.</span>
    </div>
    <div class="field">
      <label>Max output tokens</label>
      <input class="max-tokens" type="number"
        min="${MAX_TOKENS_RANGE.min}" max="${MAX_TOKENS_RANGE.max}" step="64" />
    </div>
    <div class="field">
      <label>System prompt</label>
      <textarea class="prompt" rows="6"></textarea>
      <button class="link-btn reset-prompt">Reset to default</button>
    </div>
    <div class="field">
      <div class="toggle-row">
        <input type="checkbox" id="use-embeddings" class="use-embeddings" />
        <label for="use-embeddings">Higher-accuracy retrieval</label>
      </div>
      <span class="hint">Better answers on long pages for synonym / relational questions. Off uses fast keyword (lexical) retrieval — no setup.</span>
      <span class="hint setup-hint">Requires a local embedding model: <code>ollama pull ${EMBED_MODEL}</code></span>
    </div>
    <div class="field tts-field" hidden>
      <label>Read aloud — voice</label>
      <select class="tts-voice"></select>
      <label>Speed <span class="rate-value"></span></label>
      <input class="tts-rate" type="range"
        min="${TTS_RATE_RANGE.min}" max="${TTS_RATE_RANGE.max}" step="0.1" />
      <span class="hint">Used by the 🔊 button on each response.</span>
    </div>
    <div class="field">
      <label>API keys</label>
      <button class="keys-btn">Manage API keys…</button>
      <span class="hint">Keys are entered on the extension options page only.</span>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T;
  const modelSelect = $<HTMLSelectElement>(".model");
  const temperatureInput = $<HTMLInputElement>(".temperature");
  const tempValue = $(".temp-value");
  const maxTokensInput = $<HTMLInputElement>(".max-tokens");
  const promptArea = $<HTMLTextAreaElement>(".prompt");
  const embeddingsToggle = $<HTMLInputElement>(".use-embeddings");
  const setupHint = $<HTMLElement>(".setup-hint");
  const ttsField = $<HTMLElement>(".tts-field");
  const voiceSelect = $<HTMLSelectElement>(".tts-voice");
  const rateInput = $<HTMLInputElement>(".tts-rate");
  const rateValue = $(".rate-value");
  const flash = $(".flash");

  modelSelect.innerHTML = PROVIDERS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`,
  ).join("");

  let flashTimer = 0;
  const showSaved = (): void => {
    flash.classList.add("show");
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => flash.classList.remove("show"), 1500);
  };

  const syncTempLabel = (): void => {
    tempValue.textContent = Number(temperatureInput.value).toFixed(1);
  };

  const syncRateLabel = (): void => {
    rateValue.textContent = `${Number(rateInput.value).toFixed(1)}×`;
  };

  /** (Re)populate the voice picker; voices load asynchronously in the browser. */
  function loadVoices(selected?: string): void {
    const voices = listEnglishVoices();
    voiceSelect.innerHTML = voices
      .map((v) => `<option value="${v.voiceURI}">${v.name} (${v.lang})</option>`)
      .join("");
    if (selected) voiceSelect.value = selected;
  }

  async function loadValues(): Promise<void> {
    modelSelect.value = await getDefaultModel();
    promptArea.value = await getSystemPrompt();
    const params = await getModelParams();
    temperatureInput.value = String(params.temperature);
    maxTokensInput.value = String(params.maxTokens);
    syncTempLabel();
    embeddingsToggle.checked = await getUseEmbeddings();
    setupHint.hidden = !embeddingsToggle.checked;

    if (isTtsSupported()) {
      ttsField.hidden = false;
      const prefs = await getTtsPrefs();
      loadVoices(prefs.voiceURI);
      rateInput.value = String(prefs.rate);
      syncRateLabel();
      // Voices can load late; refresh once if the list was empty (auto-removes).
      if (!voiceSelect.options.length) {
        speechSynthesis.addEventListener("voiceschanged", () => loadVoices(prefs.voiceURI), {
          once: true,
        });
      }
    }
  }

  /** Persist params from current field values, then re-sync post-clamp. */
  async function saveParams(): Promise<void> {
    await setModelParams({
      temperature: Number(temperatureInput.value) || DEFAULT_TEMPERATURE,
      maxTokens: Number(maxTokensInput.value) || DEFAULT_MAX_TOKENS,
    });
    const saved = await getModelParams();
    temperatureInput.value = String(saved.temperature);
    maxTokensInput.value = String(saved.maxTokens);
    syncTempLabel();
    showSaved();
  }

  modelSelect.addEventListener("change", async () => {
    await setDefaultModel(modelSelect.value as ProviderId);
    showSaved();
  });
  temperatureInput.addEventListener("input", syncTempLabel);
  temperatureInput.addEventListener("change", () => void saveParams());
  maxTokensInput.addEventListener("change", () => void saveParams());
  promptArea.addEventListener("change", async () => {
    await setSystemPrompt(promptArea.value);
    promptArea.value = await getSystemPrompt(); // empty → refilled with default
    showSaved();
  });
  $(".reset-prompt").addEventListener("click", async () => {
    promptArea.value = DEFAULT_SYSTEM_PROMPT;
    await setSystemPrompt(promptArea.value);
    showSaved();
  });
  embeddingsToggle.addEventListener("change", async () => {
    await setUseEmbeddings(embeddingsToggle.checked);
    setupHint.hidden = !embeddingsToggle.checked;
    showSaved();
  });
  voiceSelect.addEventListener("change", async () => {
    await setTtsVoice(voiceSelect.value);
    showSaved();
  });
  rateInput.addEventListener("input", syncRateLabel);
  rateInput.addEventListener("change", async () => {
    await setTtsRate(Number(rateInput.value));
    showSaved();
  });
  $(".keys-btn").addEventListener("click", () => {
    const cmd: RuntimeCommand = { type: "OPEN_OPTIONS" };
    void chrome.runtime.sendMessage(cmd);
  });

  return {
    el,
    isOpen: () => !el.hidden,
    open: () => {
      el.hidden = false;
      void loadValues(); // always fresh — options page may have changed values
    },
    close: () => {
      el.hidden = true;
    },
  };
}
