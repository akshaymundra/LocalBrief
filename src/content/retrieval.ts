/**
 * Retrieval over a single page's text. Pure functions, no DOM, no I/O.
 *
 * Lexical ranking = Okapi BM25 (great for factual / keyword / exact-number
 * queries). Embedding ranking = cosine similarity (great for synonym /
 * relational / paraphrased queries). When both are available they are fused
 * with Reciprocal Rank Fusion, which is robust to their different score
 * scales and needs no weight tuning.
 */

export interface Chunk {
  index: number; // position in document order
  text: string;
}

const TARGET_CHARS = 800; // approx chunk size
const MAX_CHARS = 1400; // hard split above this
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const RRF_K = 60;

// ------------------------------------------------------------------ chunking

/** Split text into ~TARGET_CHARS chunks on paragraph/sentence boundaries. */
export function chunkText(text: string): Chunk[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];

  let buf = "";
  const flush = (): void => {
    const t = buf.trim();
    if (t) pieces.push(t);
    buf = "";
  };

  for (const para of paragraphs) {
    if (para.length > MAX_CHARS) {
      flush();
      pieces.push(...splitLong(para));
      continue;
    }
    if (buf.length + para.length + 2 > TARGET_CHARS && buf) flush();
    buf += (buf ? "\n\n" : "") + para;
  }
  flush();

  return pieces.map((t, index) => ({ index, text: t }));
}

/** Hard-split an oversized paragraph on sentence boundaries, then by length. */
function splitLong(para: string): string[] {
  const sentences = para.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [para];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (s.length > MAX_CHARS) {
      if (buf) {
        out.push(buf.trim());
        buf = "";
      }
      for (let i = 0; i < s.length; i += TARGET_CHARS) {
        out.push(s.slice(i, i + TARGET_CHARS).trim());
      }
      continue;
    }
    if (buf.length + s.length > TARGET_CHARS && buf) {
      out.push(buf.trim());
      buf = "";
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// ---------------------------------------------------------------- tokenizing

/**
 * Lowercased word + number tokens. Numbers keep internal separators
 * (`1,299.00`) so exact-figure queries can match.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+|\d[\d.,]*/g) ?? [];
}

// --------------------------------------------------------------- BM25 lexical

/** Okapi BM25 score per chunk for `query`. Higher = more relevant. */
export function lexicalScore(query: string, chunks: Chunk[]): number[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (!queryTerms.length || !chunks.length) return chunks.map(() => 0);

  const docs = chunks.map((c) => tokenize(c.text));
  const lengths = docs.map((d) => d.length);
  const avgdl = lengths.reduce((a, b) => a + b, 0) / docs.length || 1;

  const tf = docs.map((doc) => {
    const m = new Map<string, number>();
    for (const t of doc) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });

  // Document frequency, restricted to query terms.
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let n = 0;
    for (const m of tf) if (m.has(term)) n++;
    df.set(term, n);
  }

  const N = docs.length;
  return chunks.map((_, i) => {
    let score = 0;
    for (const term of queryTerms) {
      const f = tf[i].get(term);
      if (!f) continue;
      const n = df.get(term)!;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * lengths[i]) / avgdl);
      score += idf * ((f * (BM25_K1 + 1)) / denom);
    }
    return score;
  });
}

// ------------------------------------------------------------ cosine (dense)

/** Cosine similarity per chunk between `queryVec` and each chunk vector. */
export function embeddingScore(queryVec: number[], chunkVecs: number[][]): number[] {
  const qn = norm(queryVec);
  return chunkVecs.map((v) => {
    const d = dot(queryVec, v);
    const denom = qn * norm(v);
    return denom ? d / denom : 0;
  });
}

const dot = (a: number[], b: number[]): number => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};
const norm = (a: number[]): number => Math.sqrt(dot(a, a));

// -------------------------------------------------------------------- fusion

/**
 * Reciprocal Rank Fusion of several score lists (aligned by chunk index).
 * Returns a fused score per chunk: Σ 1/(RRF_K + rank).
 */
export function rrfFuse(scoreLists: number[][], k = RRF_K): number[] {
  const n = scoreLists[0]?.length ?? 0;
  const fused = new Array(n).fill(0);
  for (const scores of scoreLists) {
    const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    order.forEach((chunkIdx, rank) => {
      fused[chunkIdx] += 1 / (k + rank);
    });
  }
  return fused;
}

// --------------------------------------------------------------- assembly

export interface SelectArgs {
  chunks: Chunk[];
  budget: number;
  lexicalScores: number[];
  embeddingScores?: number[];
}

/**
 * Pick the highest-scoring chunks that fit `budget` (chars), then return them
 * re-ordered into document order so the model reads coherent prose.
 */
export function selectContext({
  chunks,
  budget,
  lexicalScores,
  embeddingScores,
}: SelectArgs): string {
  const scores = embeddingScores
    ? rrfFuse([lexicalScores, embeddingScores])
    : lexicalScores;

  const ranked = chunks
    .map((c) => c.index)
    .sort((a, b) => scores[b] - scores[a]);

  const SEP = "\n\n";
  const chosen: number[] = [];
  let used = 0;
  for (const idx of ranked) {
    const cost = chunks[idx].text.length + SEP.length;
    if (used + cost > budget && chosen.length) break;
    chosen.push(idx);
    used += cost;
  }

  chosen.sort((a, b) => a - b); // document order
  return chosen.map((i) => chunks[i].text).join(SEP);
}
