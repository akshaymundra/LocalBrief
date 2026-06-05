import type { EmbedderId } from "../../types";
import type { Embedder } from "./types";
import { ollamaEmbedder } from "./ollama";

const registry: Record<EmbedderId, Embedder> = {
  ollama: ollamaEmbedder,
};

export function getEmbedder(id: EmbedderId): Embedder {
  return registry[id];
}
