/* 7-Day Pass entry point (area E): the Pass cards on Me and Deals set this one-shot wish, and Book & pay (area A)
   starts with the Pass chosen when it reads it. Kept in memory and in sessionStorage so a reload on the way still works. */
const K = 'kr6_wantPass'
let want = false
export function wantPass(): void {
  want = true
  try { sessionStorage.setItem(K, '1') } catch { /* ignore */ }
}
/** True once after a Pass card was tapped (then cleared). */
export function takePassIntent(): boolean {
  let w = want
  try { if (sessionStorage.getItem(K) === '1') w = true; sessionStorage.removeItem(K) } catch { /* ignore */ }
  want = false
  return w
}
