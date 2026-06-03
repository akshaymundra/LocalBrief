# LocalBrief

Chrome extension that summarizes — and answers questions about — the current page using your choice of model:

- **Ollama `gemma3:4b`** (default, fully local, no key)
- **Claude Haiku 4.5** (Anthropic API key)
- **GPT-4o mini** (OpenAI API key)

Click the toolbar icon → a chat banner slides down at the top of the page. Click **Summarize** (optionally with instructions like *"3 bullet points only"*), then keep asking follow-up questions about the page — the conversation keeps context. Responses stream in live as rendered markdown.

## Prerequisites (Ollama path)

1. [Ollama](https://ollama.com) installed and running.
2. The model pulled:

   ```bash
   ollama pull gemma3:4b
   ```

3. **Allow extension origins** (Ollama rejects browser-extension requests with 403 otherwise):

   ```bash
   # macOS (Ollama.app): set for launchd, then quit & restart the Ollama app
   launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
   ```

   Or, if you run the server from a terminal:

   ```bash
   OLLAMA_ORIGINS="chrome-extension://*" ollama serve
   ```

## Cloud providers (optional)

Right-click the extension icon → **Options** (or click "Open settings" in any key error):

- Paste your **Anthropic** and/or **OpenAI** API key. Keys are stored in `chrome.storage.local` only (never synced) and **auto-expire after 7 days** — you'll be asked to re-enter them.
- Pick the **default model** the banner opens with.
- Edit the **system prompt** (Reset to default available).

Switch models anytime with the dropdown in the banner header — even mid-conversation.

## Build

```bash
npm install
npm run build
```

Output goes to `dist/`.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` folder.

## Use

- Click the extension icon → banner opens (nothing runs yet).
- Optionally type instructions, then click **Summarize** (or press Enter).
- After the summary, the input switches to **Ask** mode — ask questions about the page ("what does the author conclude?", "explain point 2").
- **Copy** copies the whole conversation as markdown. **▾** collapses. **✕**/Esc closes (aborts any in-flight request).

## How it works

- `src/content.ts` — Shadow-DOM chat banner; extracts page text (`article` → `main` → `body`, 12k-char cap) into the *first* user message only; later turns are plain questions; history (pinned page-context + last turns) re-sent each request.
- `src/background.ts` — service worker; resolves system prompt + API keys from storage and routes to a provider module. Streaming relayed over a long-lived port; closing the banner aborts the request.
- `src/providers/` — `ollama.ts` (`/api/chat`, NDJSON), `openai.ts` (`/v1/chat/completions`, SSE), `anthropic.ts` (`/v1/messages`, SSE). API keys never reach the content script or page.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Ollama not reachable" | Start Ollama (`ollama serve` or the desktop app). |
| 403 error in banner | Set `OLLAMA_ORIGINS` as above and restart Ollama. |
| "Model not found" | `ollama pull gemma3:4b` |
| "API key not set or expired" | Open settings, re-enter the key (7-day expiry). |
| "Invalid … API key (401)" | Key is wrong/revoked — update in settings. |
| Icon does nothing on a page | Restricted page (`chrome://`, Web Store, PDF viewer) — extensions can't inject there. |
