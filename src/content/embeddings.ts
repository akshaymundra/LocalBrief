import type { EmbedderId, EmbedResponse, RuntimeCommand } from "../types";

/**
 * Content-side embedding client. Embedding fetches must run in the background
 * (localhost host_permissions), so this just relays texts over a runtime
 * message. Returns null on any failure (model not pulled, Ollama down, …) so
 * callers fall back to lexical-only retrieval — never a hard error.
 */
export async function embed(
  embedder: EmbedderId,
  texts: string[],
): Promise<number[][] | null> {
  if (!texts.length) return [];
  try {
    const cmd: RuntimeCommand = { type: "EMBED", embedder, texts };
    const res = (await chrome.runtime.sendMessage(cmd)) as EmbedResponse | undefined;
    // Accept only a well-formed vectors payload; anything else → lexical fallback.
    if (res && "vectors" in res && Array.isArray(res.vectors)) return res.vectors;
    return null;
  } catch {
    return null;
  }
}
