import { capToBudget, extractPageText } from "../extract";
import { PROVIDER_CHAR_BUDGET } from "../storage";
import type { EmbedderId, ProviderId } from "../types";
import { embed } from "./embeddings";
import {
  chunkText,
  embeddingScore,
  lexicalScore,
  selectContext,
  type Chunk,
} from "./retrieval";

/** Only embedder available today; retrieval is independent of the chat provider. */
const EMBEDDER: EmbedderId = "ollama";
const TEXT_CACHE_PREFIX = "pageText:";

/**
 * Owns one page's extracted text + chunks, and builds the page-context string
 * sent with each request:
 *   - no query (initial summary) → full cleaned text, capped to budget.
 *   - query (follow-up question) → retrieved chunks (lexical, or hybrid when
 *     embeddings are enabled and available).
 *
 * Memory: cleaned text + chunks live in sessionStorage (small, dies with the
 * tab). Embeddings — the large artifact — stay IN MEMORY only and are never
 * persisted, so storage never bloats. `dispose()` frees both.
 */
export interface PageContext {
  /** True if the page yielded any readable text (sync; extracts on first call). */
  hasContent(): boolean;
  buildContext(
    query: string | null,
    provider: ProviderId,
    useEmbeddings: boolean,
  ): Promise<string>;
  dispose(): void;
}

export function createPageContext(url: string): PageContext {
  const cacheKey = TEXT_CACHE_PREFIX + url;
  let chunks: Chunk[] | null = null;
  let chunkVecs: number[][] | null = null; // in-memory only
  let embedFailed = false; // after a failure, skip embeddings until dispose() (close/reset)

  function load(): Chunk[] {
    if (chunks) return chunks;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { chunks: Chunk[] };
        if (Array.isArray(parsed.chunks)) return (chunks = parsed.chunks);
      }
    } catch {
      // fall through to fresh extraction
    }
    chunks = chunkText(extractPageText());
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ chunks }));
    } catch {
      // quota/serialization — fine, just won't survive reload
    }
    return chunks;
  }

  const frame = (body: string): string =>
    `Title: ${document.title}\nURL: ${url}\n\nContent:\n${body}`;

  /** Lazily embed all chunks once; null if unavailable (caller uses lexical). */
  async function ensureChunkVecs(all: Chunk[]): Promise<number[][] | null> {
    if (chunkVecs) return chunkVecs;
    if (embedFailed) return null;
    const vecs = await embed(EMBEDDER, all.map((c) => c.text));
    if (!vecs) {
      embedFailed = true;
      return null;
    }
    return (chunkVecs = vecs);
  }

  return {
    hasContent() {
      return load().length > 0;
    },

    async buildContext(query, provider, useEmbeddings) {
      const all = load();
      const budget = PROVIDER_CHAR_BUDGET[provider];
      const fullText = all.map((c) => c.text).join("\n\n");

      // Retrieve only when there's a request AND the page exceeds budget.
      // Otherwise send the whole page (capped): covers the initial summary
      // (no query) and any request on a page that already fits — keeps breadth.
      if (!query || fullText.length <= budget) {
        return frame(capToBudget(fullText, budget));
      }

      const lexicalScores = lexicalScore(query, all);

      let embeddingScores: number[] | undefined;
      if (useEmbeddings) {
        const vecs = await ensureChunkVecs(all);
        if (vecs) {
          const [queryVec] = (await embed(EMBEDDER, [query])) ?? [];
          if (queryVec) embeddingScores = embeddingScore(queryVec, vecs);
        }
      }

      return frame(selectContext({ chunks: all, budget, lexicalScores, embeddingScores }));
    },

    dispose() {
      chunks = null;
      chunkVecs = null;
      embedFailed = false;
      try {
        sessionStorage.removeItem(cacheKey);
      } catch {
        // ignore
      }
    },
  };
}
