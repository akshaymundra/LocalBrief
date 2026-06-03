import { PROVIDERS } from "./types";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_TEMPERATURE,
  clearApiKey,
  daysRemaining,
  getDefaultModel,
  getModelParams,
  getStoredKey,
  getSystemPrompt,
  isExpired,
  setApiKey,
  setDefaultModel,
  setModelParams,
  setSystemPrompt,
} from "./storage";

type KeyedProvider = "anthropic" | "openai";
const KEYED: KeyedProvider[] = ["anthropic", "openai"];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const modelSelect = $<HTMLSelectElement>("default-model");
const promptArea = $<HTMLTextAreaElement>("system-prompt");
const temperatureInput = $<HTMLInputElement>("temperature");
const temperatureValue = $("temperature-value");
const maxTokensInput = $<HTMLInputElement>("max-tokens");

function syncTemperatureLabel(): void {
  temperatureValue.textContent = Number(temperatureInput.value).toFixed(1);
}

async function refreshKeyStatus(provider: KeyedProvider): Promise<void> {
  const status = $(`${provider}-status`);
  const entry = await getStoredKey(provider);
  if (!entry) {
    status.textContent = "No key saved.";
    status.classList.remove("saved");
  } else if (isExpired(entry.savedAt)) {
    status.textContent = "Saved key expired — enter a new one.";
    status.classList.remove("saved");
  } else {
    const days = daysRemaining(entry.savedAt);
    status.textContent = `Saved — expires in ${days} day${days === 1 ? "" : "s"}.`;
    status.classList.add("saved");
  }
}

async function load(): Promise<void> {
  modelSelect.innerHTML = PROVIDERS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`,
  ).join("");
  modelSelect.value = await getDefaultModel();
  promptArea.value = await getSystemPrompt();

  const params = await getModelParams();
  temperatureInput.value = String(params.temperature);
  maxTokensInput.value = String(params.maxTokens);
  syncTemperatureLabel();

  for (const provider of KEYED) {
    await refreshKeyStatus(provider);
    $(`${provider}-clear`).addEventListener("click", async () => {
      await clearApiKey(provider);
      ($(`${provider}-key`) as HTMLInputElement).value = "";
      await refreshKeyStatus(provider);
    });
  }
}

$("reset-prompt").addEventListener("click", () => {
  promptArea.value = DEFAULT_SYSTEM_PROMPT;
});

temperatureInput.addEventListener("input", syncTemperatureLabel);

$("reset-params").addEventListener("click", () => {
  temperatureInput.value = String(DEFAULT_TEMPERATURE);
  maxTokensInput.value = String(DEFAULT_MAX_TOKENS);
  syncTemperatureLabel();
});

$("save").addEventListener("click", async () => {
  for (const provider of KEYED) {
    const input = $(`${provider}-key`) as HTMLInputElement;
    const value = input.value.trim();
    if (value) {
      // Blank field keeps the existing key; only overwrite when typed.
      await setApiKey(provider, value);
      input.value = "";
    }
    await refreshKeyStatus(provider);
  }

  await setDefaultModel(modelSelect.value as (typeof PROVIDERS)[number]["id"]);
  await setSystemPrompt(promptArea.value);
  promptArea.value = await getSystemPrompt();

  await setModelParams({
    temperature: Number(temperatureInput.value) || DEFAULT_TEMPERATURE,
    maxTokens: Number(maxTokensInput.value) || DEFAULT_MAX_TOKENS,
  });
  const saved = await getModelParams(); // re-read post-clamp
  temperatureInput.value = String(saved.temperature);
  maxTokensInput.value = String(saved.maxTokens);
  syncTemperatureLabel();

  const flash = $("saved-flash");
  flash.classList.add("show");
  setTimeout(() => flash.classList.remove("show"), 1800);
});

void load();
