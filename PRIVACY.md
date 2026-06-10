# Privacy Policy — PageLens

**Last updated: 10 June 2026**

PageLens is a Chrome extension that summarizes the web page you are viewing and
answers follow-up questions about it, using an AI provider you choose (a local
Ollama model, Anthropic Claude, or OpenAI). This policy explains exactly what
data the extension handles and where it goes.

PageLens has **no servers of its own**. The developer does not receive, store,
or have access to any of your data.

## What data PageLens handles

**1. Website content (the page you summarize)**
When you open the drawer and request a summary or ask a question, PageLens reads
the text of the current page and sends it to the AI provider you have selected,
so that provider can generate a response. It is used only for this purpose and
is not stored by the extension after the request.

**2. Authentication information (API keys)**
If you choose Anthropic Claude or OpenAI, you provide your own API key. The key
is stored **only on your device** using `chrome.storage.local`. It is:
- never synced to any account or cloud,
- never sent anywhere except directly to the provider it belongs to, as the
  authentication header of your request,
- automatically deleted after 7 days, after which you re-enter it.

PageLens does **not** collect personally identifiable information, health,
financial, or location data, personal communications, web-browsing history, or
analytics.

## Where your data goes

Your data is sent only to the provider you select for a given request:

- **Ollama (local, default):** Page text is sent to a server running on your own
  computer (`http://localhost:11434`). It **never leaves your machine** and no
  API key is involved.
- **Anthropic Claude:** Page text and your prompts are sent to Anthropic
  (`https://api.anthropic.com`) using your own API key.
- **OpenAI:** Page text and your prompts are sent to OpenAI
  (`https://api.openai.com`) using your own API key.

When you use a cloud provider, that provider's handling of the data is governed
by **their** privacy policy:
- Anthropic: https://www.anthropic.com/legal/privacy
- OpenAI: https://openai.com/policies/privacy-policy

PageLens itself transmits nothing to the developer or any third party other than
the provider you choose.

## Data sharing and sale

- We do **not** sell or transfer your data to third parties, except sending it
  to the AI provider you select solely to fulfill your request.
- We do **not** use or transfer your data for any purpose unrelated to the
  extension's single purpose (summarizing and answering questions about the
  current page).
- We do **not** use or transfer your data to determine creditworthiness or for
  lending purposes.

## Data storage and retention

All settings (chosen model, system prompt, interface preferences) and API keys
are stored locally on your device via `chrome.storage.local`. API keys expire
and are purged after 7 days. Your per-page chat history is kept only in the
tab's session storage and is cleared when you close the tab or reset the chat.
Uninstalling the extension removes all locally stored data.

## Children's privacy

PageLens is not directed to children under 13 and does not knowingly collect
data from them.

## Changes to this policy

If this policy changes, the updated version will be posted at this URL with a
new "Last updated" date.

## Contact

Questions about this policy: **akshay.mundra@sparkeighteen.com**
