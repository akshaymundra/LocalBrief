/** Maximum characters of page text sent to the model (keeps gemma3:4b fast). */
const MAX_CHARS = 12_000;

/**
 * Extract the main readable text of the current page using a simple
 * heuristic: prefer <article>, then <main>, then fall back to <body>.
 */
export function extractPageText(): string {
  const root =
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.body;

  const text = (root?.innerText ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS) + "\n\n[Content truncated]";
}
