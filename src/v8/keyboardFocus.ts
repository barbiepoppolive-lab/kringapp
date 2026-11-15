/**
 * P (15 Nov): the phone keyboard covered the greeting box, the chat box and the email-code box.
 * index.html asks Android Chrome to shrink the page when the keyboard opens (interactive-widget=resizes-content);
 * on top of that, whenever a text box gets focus and the keyboard makes the visible area smaller, the box is scrolled
 * into the middle of what is still visible (iPhone Safari and older Android browsers ignore interactive-widget).
 */
const isTextBox = (el: Element | null): el is HTMLElement =>
  !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|range|color)$/i.test((el as HTMLInputElement).type)) || (el as HTMLElement).isContentEditable);

/** Pure: is the box hidden under the keyboard (below the visible area)? */
export function coveredByKeyboard(rect: { top: number; bottom: number }, visibleTop: number, visibleHeight: number): boolean {
  return rect.bottom > visibleTop + visibleHeight - 8 || rect.top < visibleTop;
}

export function installKeyboardFocus(win: Window = window): () => void {
  const vv = win.visualViewport;
  let t: ReturnType<typeof setTimeout> | undefined;
  const reveal = () => {
    const el = win.document.activeElement;
    if (!isTextBox(el)) return;
    const r = el.getBoundingClientRect();
    const top = vv ? vv.offsetTop : 0, h = vv ? vv.height : win.innerHeight;
    if (coveredByKeyboard(r, top, h)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const onFocus = (e: FocusEvent) => { if (isTextBox(e.target as Element)) { clearTimeout(t); t = setTimeout(reveal, 320); } };
  const onResize = () => { clearTimeout(t); t = setTimeout(reveal, 120); };
  win.document.addEventListener('focusin', onFocus);
  vv?.addEventListener('resize', onResize);
  return () => { win.document.removeEventListener('focusin', onFocus); vv?.removeEventListener('resize', onResize); clearTimeout(t); };
}
