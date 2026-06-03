import { readLines } from "./index";
import { ProviderError, type Provider, type StreamChatArgs } from "./types";
import { PROVIDERS } from "../types";
import { getApiKey } from "../storage";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = PROVIDERS.find((p) => p.id === "anthropic")!.model;
const MAX_TOKENS = 1024;

export const anthropic: Provider = {
  id: "anthropic",

  async streamChat({ system, messages, signal, onToken }: StreamChatArgs) {
    const key = await getApiKey("anthropic");
    if (!key) {
      throw new ProviderError(
        "Anthropic API key not set or expired. Open settings to add it.",
        true,
      );
    }

    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        signal,
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          stream: true,
          system, // Anthropic: system prompt is top-level, not a message role
          messages,
        }),
      });
    } catch (err) {
      if (signal.aborted) return;
      throw new ProviderError("Anthropic not reachable — check your network connection.");
    }

    if (response.status === 401) {
      throw new ProviderError("Invalid Anthropic API key (401). Update it in settings.", true);
    }
    if (response.status === 429) {
      throw new ProviderError("Anthropic rate limit hit (429). Wait a moment and retry.");
    }
    if (!response.ok) {
      throw new ProviderError(`Anthropic error: HTTP ${response.status}`);
    }

    // SSE: token deltas arrive as content_block_delta events with delta.text.
    let failure: ProviderError | null = null;
    await readLines(response, (line) => {
      if (failure || !line.startsWith("data:")) return;
      const data = JSON.parse(line.slice(5).trim()) as {
        type?: string;
        delta?: { type?: string; text?: string };
        error?: { message?: string };
      };
      if (data.type === "error") {
        failure = new ProviderError(`Anthropic: ${data.error?.message ?? "unknown error"}`);
        return;
      }
      if (data.type === "content_block_delta" && data.delta?.text) {
        onToken(data.delta.text);
      }
    });
    if (failure) throw failure;
  },
};
