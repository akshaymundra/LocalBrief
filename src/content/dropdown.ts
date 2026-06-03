import {
  PROVIDERS,
  type ProviderId,
  type ProviderStatus,
  type RuntimeCommand,
} from "../types";

const KEY_TOOLTIP = "Set API key in extension settings";

/** Model selector in the drawer header. Owns the current provider selection. */
export interface ModelDropdown {
  selected(): ProviderId;
}

function providerLabel(id: ProviderId): string {
  return PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

async function fetchProviderStatus(): Promise<ProviderStatus> {
  try {
    const cmd: RuntimeCommand = { type: "GET_PROVIDER_STATUS" };
    return (await chrome.runtime.sendMessage(cmd)) as ProviderStatus;
  } catch {
    return { ollama: true, anthropic: false, openai: false };
  }
}

export function createModelDropdown(
  shadow: ShadowRoot,
  modelBtn: HTMLButtonElement,
  modelList: HTMLElement,
): ModelDropdown {
  let selectedProvider: ProviderId = "ollama";

  const setLabel = (): void => {
    (modelBtn.querySelector(".label") as HTMLElement).textContent =
      providerLabel(selectedProvider);
  };

  const renderList = (status: ProviderStatus): void => {
    modelList.replaceChildren();
    for (const p of PROVIDERS) {
      const usable = status[p.id];
      const item = document.createElement("div");
      item.className = "dropdown-item" + (usable ? "" : " disabled");
      item.innerHTML = `
        <span class="check">${p.id === selectedProvider ? "✓" : ""}</span>
        <span>${p.label}</span>
        ${usable ? "" : `<span class="lock">🔒</span><span class="tooltip">${KEY_TOOLTIP}</span>`}
      `;
      item.addEventListener("click", () => {
        if (usable) {
          selectedProvider = p.id;
          setLabel();
          modelList.classList.remove("open");
        } else {
          // Shortcut: jump straight to settings to add the key.
          const cmd: RuntimeCommand = { type: "OPEN_OPTIONS" };
          void chrome.runtime.sendMessage(cmd);
        }
      });
      modelList.appendChild(item);
    }
  };

  modelBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (modelList.classList.contains("open")) {
      modelList.classList.remove("open");
      return;
    }
    // Refresh on every open — keys may have been added/expired meanwhile.
    renderList(await fetchProviderStatus());
    modelList.classList.add("open");
  });

  shadow.addEventListener("click", (e) => {
    if (!modelList.contains(e.target as Node) && e.target !== modelBtn) {
      modelList.classList.remove("open");
    }
  });
  shadow.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") modelList.classList.remove("open");
  });

  // Initial selection: stored default, falling back to ollama if its key is gone.
  void (async () => {
    const [{ defaultModel }, status] = await Promise.all([
      chrome.storage.local.get("defaultModel"),
      fetchProviderStatus(),
    ]);
    const wanted = (defaultModel as ProviderId | undefined) ?? "ollama";
    selectedProvider =
      PROVIDERS.some((p) => p.id === wanted) && status[wanted] ? wanted : "ollama";
    setLabel();
  })();

  setLabel();

  return { selected: () => selectedProvider };
}
