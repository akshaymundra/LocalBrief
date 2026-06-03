import { readLines } from "./index";
import { ProviderError, type Provider, type StreamChatArgs } from "./types";
import { PROVIDERS } from "../types";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODEL = PROVIDERS.find((p) => p.id === "ollama")!.model;

export const ollama: Provider = {
  id: "ollama",

  async streamChat({ system, messages, temperature, maxTokens, signal, onToken }: StreamChatArgs) {
    let response: Response;
    try {
      response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          options: { temperature, num_predict: maxTokens },
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
    } catch (err) {
      if (signal.aborted) return;
      throw new ProviderError(
        "Ollama not reachable at localhost:11434 — is it running? (`ollama serve`)",
      );
    }

    if (response.status === 403) {
      throw new ProviderError(
        "Ollama rejected the request (403). Allow extension origins:\n" +
          '`launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` then restart Ollama.',
      );
    }
    if (response.status === 404) {
      throw new ProviderError(`Model ${MODEL} not found — run \`ollama pull ${MODEL}\`.`);
    }
    if (!response.ok) {
      throw new ProviderError(`Ollama error: HTTP ${response.status}`);
    }

    // NDJSON: one JSON object per line; token delta in message.content.
    let failure: ProviderError | null = null;
    await readLines(response, (line) => {
      if (failure) return;
      const data = JSON.parse(line) as {
        message?: { content?: string };
        done?: boolean;
        error?: string;
      };
      if (data.error) {
        failure = new ProviderError(`Ollama: ${data.error}`);
        return;
      }
      if (data.message?.content) onToken(data.message.content);
    });
    if (failure) throw failure;
  },
};
