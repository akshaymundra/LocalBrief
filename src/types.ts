/** Supported model providers. */
export type ProviderId = "ollama" | "anthropic" | "openai";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  model: string;
  needsKey: boolean;
}

export const PROVIDERS: ProviderMeta[] = [
  { id: "ollama", label: "Ollama · gemma3:4b", model: "gemma3:4b", needsKey: false },
  { id: "anthropic", label: "Claude Haiku 4.5", model: "claude-haiku-4-5", needsKey: true },
  { id: "openai", label: "GPT-4o mini", model: "gpt-4o-mini", needsKey: true },
];

/** A single conversation turn. Provider-neutral. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Content script → background over the port. System prompt and API keys are resolved background-side. */
export interface ChatRequest {
  type: "CHAT";
  provider: ProviderId;
  messages: ChatMessage[];
}

/** Background → content script over the port. */
export type StreamMessage =
  | { type: "CHUNK"; token: string }
  | { type: "DONE" }
  | { type: "ERROR"; message: string; openSettings?: boolean };

/** One-shot runtime messages (chrome.runtime.sendMessage / tabs.sendMessage). */
export type RuntimeCommand =
  | { type: "OPEN_BANNER" } // background → content: open banner, do NOT auto-summarize
  | { type: "OPEN_OPTIONS" } // content → background: open the options page
  | { type: "GET_PROVIDER_STATUS" }; // content → background: which providers are usable

/** GET_PROVIDER_STATUS response: true = selectable (key present or not needed). */
export type ProviderStatus = Record<ProviderId, boolean>;

/** A persisted conversation turn. `content` goes to the model; `display` is rendered. */
export interface StoredTurn {
  role: "user" | "assistant";
  content: string;
  display: string;
}

export const PORT_NAME = "summarize";
