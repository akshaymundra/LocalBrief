import { PROVIDERS } from "./types";
import {
  DEFAULT_SYSTEM_PROMPT,
  clearApiKey,
  daysRemaining,
  getDefaultModel,
  getStoredKey,
  getSystemPrompt,
  isExpired,
  setApiKey,
  setDefaultModel,
  setSystemPrompt,
} from "./storage";

type KeyedProvider = "anthropic" | "openai";
const KEYED: KeyedProvider[] = ["anthropic", "openai"];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const modelSelect = $<HTMLSelectElement>("default-model");
const promptArea = $<HTMLTextAreaElement>("system-prompt");

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

  const flash = $("saved-flash");
  flash.classList.add("show");
  setTimeout(() => flash.classList.remove("show"), 1800);
});

void load();
