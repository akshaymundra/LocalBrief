import { EMBED_MODEL } from "../../storage";
import { ProviderError, type Embedder } from "./types";

const OLLAMA_EMBED_URL = "http://localhost:11434/api/embed";

export const ollamaEmbedder: Embedder = {
  id: "ollama",

  async embed(texts) {
    let response: Response;
    try {
      response = await fetch(OLLAMA_EMBED_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      });
    } catch {
      throw new ProviderError("Ollama not reachable at localhost:11434.");
    }

    if (response.status === 404) {
      throw new ProviderError(
        `Embedding model ${EMBED_MODEL} not found — run \`ollama pull ${EMBED_MODEL}\`.`,
      );
    }
    if (!response.ok) {
      throw new ProviderError(`Ollama embeddings error: HTTP ${response.status}`);
    }

    const data = (await response.json()) as { embeddings?: number[][]; error?: string };
    if (data.error) throw new ProviderError(`Ollama: ${data.error}`);
    if (!data.embeddings?.length) throw new ProviderError("Ollama returned no embeddings.");
    return data.embeddings;
  },
};
