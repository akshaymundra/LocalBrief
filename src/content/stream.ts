import {
  PORT_NAME,
  type ChatMessage,
  type ChatRequest,
  type ProviderId,
  type StreamMessage,
} from "../types";

/**
 * Port client for the background service worker. Owns the transport state
 * (port + liveness); view-side streaming state belongs to the chat controller.
 */
export interface StreamHandlers {
  onChunk(token: string): void;
  onDone(): void;
  onError(message: string, openSettings: boolean): void;
}

export interface StreamClient {
  start(provider: ProviderId, messages: ChatMessage[], handlers: StreamHandlers): void;
  /** Disconnecting the port aborts the in-flight fetch background-side. */
  abort(): void;
  isStreaming(): boolean;
}

export function createStreamClient(): StreamClient {
  let port: chrome.runtime.Port | null = null;
  let streaming = false;

  function abort(): void {
    port?.disconnect();
    port = null;
    streaming = false;
  }

  return {
    start(provider, messages, handlers) {
      abort();
      streaming = true;

      port = chrome.runtime.connect({ name: PORT_NAME });
      port.onMessage.addListener((msg: StreamMessage) => {
        switch (msg.type) {
          case "CHUNK":
            handlers.onChunk(msg.token);
            break;
          case "DONE":
            streaming = false;
            handlers.onDone();
            break;
          case "ERROR":
            streaming = false;
            handlers.onError(msg.message, msg.openSettings ?? false);
            break;
        }
      });
      port.onDisconnect.addListener(() => {
        // Background died mid-stream — finalize the partial response.
        if (streaming) {
          streaming = false;
          handlers.onDone();
        }
      });

      const req: ChatRequest = { type: "CHAT", provider, messages };
      port.postMessage(req);
    },
    abort,
    isStreaming: () => streaming,
  };
}
