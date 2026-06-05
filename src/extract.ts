/** Elements that never carry primary content — dropped before reading text. */
const NOISE_SELECTOR =
  "script,style,noscript,template,nav,header,footer,aside,[aria-hidden=true],[role=navigation],[role=banner],[role=contentinfo]";

/**
 * Extract the main readable text of the current page.
 *
 * Heuristic root: <article> → <main> → <body>. A clone of the root is
 * stripped of noise (nav/header/footer/scripts/etc.) before reading
 * `innerText`, so the budget holds more real content. Numbers, currency,
 * percentages, list and table text are preserved verbatim (needed for
 * factual / exact-data questions); only runs of blank space are collapsed.
 *
 * Returns the FULL cleaned text (no cap). Callers cap to a per-provider
 * budget via `capToBudget`.
 */
export function extractPageText(): string {
  const source =
    document.querySelector("article") ??
    document.querySelector("main") ??
    document.body;

  if (!source) return "";

  // Work on a clone so the live page is never mutated.
  const root = source.cloneNode(true) as HTMLElement;
  for (const el of root.querySelectorAll(NOISE_SELECTOR)) {
    el.remove();
  }

  return (root.innerText ?? "")
    .replace(/[ \t]+\n/g, "\n") // trailing spaces on a line
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs
    .replace(/[ \t]{2,}/g, " ") // collapse inline whitespace runs
    .trim();
}

/** Cap text to `maxChars`, appending a truncation marker when cut. */
export function capToBudget(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Content truncated]";
}
