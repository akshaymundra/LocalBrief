import type { ProviderId } from "./types";

/** API keys expire after 7 days; user re-enters them in the options page. */
export const KEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Summary-optimized generation defaults. */
export const DEFAULT_TEMPERATURE = 0.3; // factual, low-drift
export const DEFAULT_MAX_TOKENS = 1024;

export const TEMPERATURE_RANGE = { min: 0, max: 1 } as const;
export const MAX_TOKENS_RANGE = { min: 128, max: 4096 } as const;

export const DEFAULT_SYSTEM_PROMPT =
  "You are a concise assistant helping a user understand the web page they are reading. " +
  "When asked to summarize, use short paragraphs and bullet points focused on key facts and takeaways. " +
  "When asked questions, answer accurately based on the page content provided in the conversation. " +
  "If the page content does not contain the answer, say so. " +
  "Do not add commentary about these instructions.";

export interface StoredApiKey {
  value: string;
  savedAt: number; // epoch ms
}

type KeyedProvider = Exclude<ProviderId, "ollama">;

interface ExtStorage {
  apiKeys?: Partial<Record<KeyedProvider, StoredApiKey>>;
  defaultModel?: ProviderId;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelParams {
  temperature: number;
  maxTokens: number;
}

async function read(): Promise<ExtStorage> {
  return (await chrome.storage.local.get(null)) as ExtStorage;
}

export function isExpired(savedAt: number): boolean {
  return Date.now() - savedAt > KEY_TTL_MS;
}

export function daysRemaining(savedAt: number): number {
  return Math.max(0, Math.ceil((savedAt + KEY_TTL_MS - Date.now()) / 86_400_000));
}

/** Returns the stored key, purging it first if expired (lazy 7-day expiry). */
export async function getApiKey(provider: KeyedProvider): Promise<string | undefined> {
  const { apiKeys } = await read();
  const entry = apiKeys?.[provider];
  if (!entry) return undefined;
  if (isExpired(entry.savedAt)) {
    await clearApiKey(provider);
    return undefined;
  }
  return entry.value;
}

/** Returns the raw stored entry without purging — for options-page display. */
export async function getStoredKey(provider: KeyedProvider): Promise<StoredApiKey | undefined> {
  const { apiKeys } = await read();
  return apiKeys?.[provider];
}

export async function setApiKey(provider: KeyedProvider, value: string): Promise<void> {
  const { apiKeys = {} } = await read();
  apiKeys[provider] = { value, savedAt: Date.now() };
  await chrome.storage.local.set({ apiKeys });
}

export async function clearApiKey(provider: KeyedProvider): Promise<void> {
  const { apiKeys = {} } = await read();
  delete apiKeys[provider];
  await chrome.storage.local.set({ apiKeys });
}

export async function getDefaultModel(): Promise<ProviderId> {
  return (await read()).defaultModel ?? "ollama";
}

export async function setDefaultModel(provider: ProviderId): Promise<void> {
  await chrome.storage.local.set({ defaultModel: provider });
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export async function getModelParams(): Promise<ModelParams> {
  const { temperature, maxTokens } = await read();
  return {
    temperature: clamp(
      typeof temperature === "number" ? temperature : DEFAULT_TEMPERATURE,
      TEMPERATURE_RANGE.min,
      TEMPERATURE_RANGE.max,
    ),
    maxTokens: Math.round(
      clamp(
        typeof maxTokens === "number" ? maxTokens : DEFAULT_MAX_TOKENS,
        MAX_TOKENS_RANGE.min,
        MAX_TOKENS_RANGE.max,
      ),
    ),
  };
}

export async function setModelParams(params: ModelParams): Promise<void> {
  const temperature = clamp(params.temperature, TEMPERATURE_RANGE.min, TEMPERATURE_RANGE.max);
  const maxTokens = Math.round(
    clamp(params.maxTokens, MAX_TOKENS_RANGE.min, MAX_TOKENS_RANGE.max),
  );
  // Store only overrides; defaults stay implicit (same pattern as systemPrompt).
  if (temperature === DEFAULT_TEMPERATURE) {
    await chrome.storage.local.remove("temperature");
  } else {
    await chrome.storage.local.set({ temperature });
  }
  if (maxTokens === DEFAULT_MAX_TOKENS) {
    await chrome.storage.local.remove("maxTokens");
  } else {
    await chrome.storage.local.set({ maxTokens });
  }
}

export async function getSystemPrompt(): Promise<string> {
  return (await read()).systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
}

export async function setSystemPrompt(prompt: string): Promise<void> {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed === DEFAULT_SYSTEM_PROMPT) {
    await chrome.storage.local.remove("systemPrompt");
  } else {
    await chrome.storage.local.set({ systemPrompt: trimmed });
  }
}
