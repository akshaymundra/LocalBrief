import type { ProviderId } from "../types";
import type { Provider } from "./types";
import { ollama } from "./ollama";
import { openai } from "./openai";
import { anthropic } from "./anthropic";

const registry: Record<ProviderId, Provider> = {
  ollama,
  openai,
  anthropic,
};

export function getProvider(id: ProviderId): Provider {
  return registry[id];
}

/**
 * Reads a streaming response body line by line (NDJSON and SSE are both
 * line-delimited) and invokes onLine for each non-empty line.
 */
export async function readLines(
  response: Response,
  onLine: (line: string) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) onLine(trimmed);
    }
  }
  const rest = buffer.trim();
  if (rest) onLine(rest);
}
