import type { ChatMessage, ProviderId } from "../types";

export interface StreamChatArgs {
  system: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onToken: (token: string) => void;
}

export interface Provider {
  id: ProviderId;
  /** Streams a chat completion; resolves when done, throws ProviderError on failure. */
  streamChat(args: StreamChatArgs): Promise<void>;
}

/** Error with a user-facing message; openSettings → banner shows an "Open settings" action. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public openSettings = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
