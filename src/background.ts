import {
  PORT_NAME,
  type ChatRequest,
  type ProviderStatus,
  type RuntimeCommand,
  type StreamMessage,
} from "./types";
import { getApiKey, getModelParams, getSystemPrompt } from "./storage";
import { getProvider } from "./providers";
import { ProviderError } from "./providers/types";

// Toolbar icon click → tell the tab's content script to open the banner.
// Fails silently on restricted pages (chrome:// etc.) — brief ✕ badge instead.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  const cmd: RuntimeCommand = { type: "OPEN_BANNER" };
  chrome.tabs.sendMessage(tab.id, cmd).catch(() => {
    chrome.action.setBadgeText({ tabId: tab.id, text: "✕" });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id!, text: "" }), 2000);
  });
});

// Content script asks us to open the options page (it can't do so directly),
// or which providers are currently usable (key presence only — never key values).
chrome.runtime.onMessage.addListener((msg: RuntimeCommand, _sender, sendResponse) => {
  if (msg.type === "OPEN_OPTIONS") {
    void chrome.runtime.openOptionsPage();
    return;
  }
  if (msg.type === "GET_PROVIDER_STATUS") {
    void (async () => {
      const status: ProviderStatus = {
        ollama: true,
        anthropic: !!(await getApiKey("anthropic")),
        openai: !!(await getApiKey("openai")),
      };
      sendResponse(status);
    })();
    return true; // async response
  }
});

// Long-lived port per chat request. Disconnect aborts the in-flight fetch.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener((msg: ChatRequest) => {
    if (msg.type === "CHAT") {
      void handleChat(msg, port, controller.signal);
    }
  });
});

async function handleChat(
  msg: ChatRequest,
  port: chrome.runtime.Port,
  signal: AbortSignal,
): Promise<void> {
  const send = (m: StreamMessage) => {
    try {
      port.postMessage(m);
    } catch {
      // Port closed mid-stream — abort handled by onDisconnect.
    }
  };

  try {
    const [system, params] = await Promise.all([getSystemPrompt(), getModelParams()]);
    await getProvider(msg.provider).streamChat({
      system,
      messages: msg.messages,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      signal,
      onToken: (token) => send({ type: "CHUNK", token }),
    });
    if (!signal.aborted) send({ type: "DONE" });
  } catch (err) {
    if (signal.aborted) return;
    if (err instanceof ProviderError) {
      send({ type: "ERROR", message: err.message, openSettings: err.openSettings });
    } else {
      send({ type: "ERROR", message: "Stream interrupted — try again." });
    }
  }
}
