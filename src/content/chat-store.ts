import type { ChatMessage, StoredTurn } from "../types";

/** Keep page-context message (index 0) + the most recent turns. */
const MAX_HISTORY = 20;

/**
 * Conversation turns for one page, persisted in sessionStorage so the chat
 * survives drawer close + reloads in this tab; new URL = fresh chat.
 */
export interface ChatStore {
  readonly turns: readonly StoredTurn[];
  push(turn: StoredTurn): void;
  clear(): void;
  /** History sent to the model: pins the page-context message, trims the middle. */
  toMessages(): ChatMessage[];
  isEmpty(): boolean;
}

export function createChatStore(storeKey: string): ChatStore {
  let turns: StoredTurn[] = load();

  function load(): StoredTurn[] {
    try {
      const raw = sessionStorage.getItem(storeKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as StoredTurn[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save(): void {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(turns));
    } catch {
      // Quota/serialization failure — chat still works, just won't survive close.
    }
  }

  return {
    get turns() {
      return turns;
    },
    push(turn) {
      turns.push(turn);
      save();
    },
    clear() {
      turns = [];
      sessionStorage.removeItem(storeKey);
    },
    toMessages() {
      const messages = turns.map(({ role, content }) => ({ role, content }));
      if (messages.length <= MAX_HISTORY) return messages;
      // Pin the page-context message; keep the most recent turns.
      return [messages[0], ...messages.slice(messages.length - (MAX_HISTORY - 1))];
    },
    isEmpty() {
      return turns.length === 0;
    },
  };
}
