import { readLines } from "./index";
import { ProviderError, type Provider, type StreamChatArgs } from "./types";
import { PROVIDERS } from "../types";
import { getApiKey } from "../storage";

const API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = PROVIDERS.find((p) => p.id === "openai")!.model;

export const openai: Provider = {
  id: "openai",

  async streamChat({ system, messages, signal, onToken }: StreamChatArgs) {
    const key = await getApiKey("openai");
    if (!key) {
      throw new ProviderError(
        "OpenAI API key not set or expired. Open settings to add it.",
        true,
      );
    }

    let response: Response;
    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal,
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
    } catch (err) {
      if (signal.aborted) return;
      throw new ProviderError("OpenAI not reachable — check your network connection.");
    }

    if (response.status === 401) {
      throw new ProviderError("Invalid OpenAI API key (401). Update it in settings.", true);
    }
    if (response.status === 429) {
      throw new ProviderError("OpenAI rate limit hit (429). Wait a moment and retry.");
    }
    if (!response.ok) {
      throw new ProviderError(`OpenAI error: HTTP ${response.status}`);
    }

    // SSE: lines prefixed "data: ", token in choices[0].delta.content, ends with [DONE].
    await readLines(response, (line) => {
      if (!line.startsWith("data:")) return;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      const data = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const token = data.choices?.[0]?.delta?.content;
      if (token) onToken(token);
    });
  },
};
