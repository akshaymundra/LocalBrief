/**
 * Autoscroll follow-state for the chat thread. Direction-based: ANY upward
 * user gesture disengages (even 1px — slow trackpad scrolls must never be
 * fought); re-engage only when the user lands back at the very bottom.
 */
export interface AutoScroller {
  /** Wire wheel + scroll listeners on the thread. Call once after creation. */
  attach(): void;
  /** Unconditional scroll to bottom (user action: send, restore, error). */
  scrollToBottom(): void;
  /** Scroll to bottom only while follow is engaged (streaming renders). */
  follow(): void;
  /** Re-engage follow (user just sent a message — they want to see the reply). */
  engage(): void;
}

export function createAutoScroller(thread: HTMLElement): AutoScroller {
  let autoFollow = true;
  let programmaticScroll = false;
  let lastScrollTop = 0;

  function scrollToBottom(): void {
    programmaticScroll = true;
    thread.scrollTop = thread.scrollHeight;
    requestAnimationFrame(() => {
      programmaticScroll = false;
    });
  }

  return {
    attach() {
      thread.addEventListener(
        "wheel",
        (e) => {
          if (e.deltaY < 0) autoFollow = false;
        },
        { passive: true },
      );
      thread.addEventListener("scroll", () => {
        const top = thread.scrollTop;
        if (programmaticScroll) {
          lastScrollTop = top; // our own scroll — record, don't interpret
          return;
        }
        if (top < lastScrollTop) {
          autoFollow = false; // user moved up (trackpad, scrollbar, touch)
        } else if (thread.scrollHeight - top - thread.clientHeight <= 2) {
          autoFollow = true; // user landed at the bottom — resume following
        }
        lastScrollTop = top;
      });
    },
    scrollToBottom,
    follow() {
      // Follow the stream only while engaged — never fight an upward scroll.
      if (autoFollow) scrollToBottom();
    },
    engage() {
      autoFollow = true;
    },
  };
}
