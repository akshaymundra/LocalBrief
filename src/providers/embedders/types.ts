import type { EmbedderId } from "../../types";
import { ProviderError } from "../types";

export { ProviderError };

/**
 * Embedding provider for retrieval. Mirrors the chat `Provider` shape so cloud
 * embedders (OpenAI, Voyage, …) can be added by dropping in a new module.
 */
export interface Embedder {
  id: EmbedderId;
  /** Embed `texts`; returns one vector per text, in order. Throws ProviderError. */
  embed(texts: string[]): Promise<number[][]>;
}
