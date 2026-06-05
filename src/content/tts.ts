/**
 * Text-to-speech via the browser's Web Speech API (`speechSynthesis`).
 * Free, offline, no key. Spoken input must be PLAIN text (callers pass the
 * rendered message's textContent, never raw markdown).
 */

const supported = typeof window !== "undefined" && "speechSynthesis" in window;

let voicesCache: SpeechSynthesisVoice[] = [];
if (supported) {
  const refresh = (): void => {
    voicesCache = speechSynthesis.getVoices();
  };
  refresh();
  // First getVoices() is often empty until the engine loads them.
  speechSynthesis.addEventListener("voiceschanged", refresh);
}

export function isTtsSupported(): boolean {
  return supported;
}

/** English voices for the settings picker (falls back to all if none tagged en). */
export function listEnglishVoices(): SpeechSynthesisVoice[] {
  const en = voicesCache.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return en.length ? en : voicesCache;
}

function pickVoice(voiceURI?: string): SpeechSynthesisVoice | null {
  if (!voicesCache.length) return null;
  if (voiceURI) {
    const chosen = voicesCache.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  const en = voicesCache.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return en.find((v) => v.localService) ?? en[0] ?? voicesCache[0] ?? null;
}

/**
 * Split into sentence-sized chunks (~maxLen). Chrome stops a single long
 * utterance after ~15s, so we queue many short ones instead.
 */
function chunk(text: string, maxLen = 200): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?\n]+[.!?]*\s*/g) ?? [];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf.length + s.length > maxLen && buf) {
      out.push(buf.trim());
      buf = "";
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export interface SpeakOpts {
  voiceURI?: string;
  rate: number;
}

export interface SpeakCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
}

export interface Tts {
  isSupported: boolean;
  speak(text: string, opts: SpeakOpts, cb?: SpeakCallbacks): void;
  stop(): void;
  isSpeaking(): boolean;
}

export function createTts(): Tts {
  if (!supported) {
    return { isSupported: false, speak() {}, stop() {}, isSpeaking: () => false };
  }

  let runId = 0; // bumps on every speak/stop so stale callbacks are ignored
  let speaking = false;
  let endCb: (() => void) | null = null;

  function finish(id: number): void {
    if (id !== runId) return;
    speaking = false;
    const cb = endCb;
    endCb = null;
    cb?.();
  }

  return {
    isSupported: true,

    speak(text, opts, cb) {
      this.stop();
      const pieces = chunk(text);
      if (!pieces.length) return;

      const id = ++runId;
      speaking = true;
      endCb = cb?.onEnd ?? null;
      const voice = pickVoice(opts.voiceURI);

      pieces.forEach((piece, i) => {
        const u = new SpeechSynthesisUtterance(piece);
        if (voice) u.voice = voice;
        u.rate = opts.rate;
        if (i === 0) u.onstart = () => id === runId && cb?.onStart?.();
        if (i === pieces.length - 1) u.onend = () => finish(id);
        u.onerror = () => finish(id);
        speechSynthesis.speak(u);
      });
    },

    stop() {
      runId++; // invalidate pending callbacks before cancel fires them
      const cb = endCb;
      endCb = null;
      speaking = false;
      speechSynthesis.cancel();
      cb?.();
    },

    isSpeaking: () => speaking,
  };
}
