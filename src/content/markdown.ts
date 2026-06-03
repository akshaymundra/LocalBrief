import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Single sanitization choke point: ALL model output rendered as HTML must go
 * through here (page content echoed back by the model can carry markup).
 */
export function renderMarkdown(markdown: string): string {
  return DOMPurify.sanitize(marked.parse(markdown) as string);
}
