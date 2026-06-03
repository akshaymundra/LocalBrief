import { DRAWER_WIDTH_RANGE, setDrawerWidth } from "../storage";

const clampWidth = (px: number): number =>
  Math.min(DRAWER_WIDTH_RANGE.max, Math.max(DRAWER_WIDTH_RANGE.min, px));

/** Drag the drawer's left edge to resize; the final width persists across pages. */
export function initResize(drawer: HTMLElement, handle: HTMLElement): void {
  let startX = 0;
  let startWidth = 0;
  let width = 0;

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    startX = e.clientX;
    width = startWidth = drawer.getBoundingClientRect().width;
    drawer.classList.add("resizing"); // kill the transform transition while dragging
  });
  handle.addEventListener("pointermove", (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    width = clampWidth(startWidth + (startX - e.clientX));
    drawer.style.setProperty("--drawer-width", `${width}px`);
  });
  const endDrag = (e: PointerEvent): void => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    handle.releasePointerCapture(e.pointerId);
    drawer.classList.remove("resizing");
    void setDrawerWidth(width);
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
}
