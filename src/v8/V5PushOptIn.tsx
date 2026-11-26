/** r14 (26 Nov, founder): "Want to know the moment your Reel is approved?" bottom sheet. Raises phone-notification opt-in so the
 *  app spends fewer LINE messages. Shown right after a Reel / photo upload, and once on Me for members who have posted; never on a
 *  first app open for the Me moment, at most once per 3 days per device, never when notifications are on or blocked.
 *  [Turn on] uses the existing web-push code (push.ts pushEnable). iPhone Safari tab: the 2-step Add to Home Screen guide instead.
 *  One language at a time. Logged as kr8_log_client 'push_prompt' shown / accepted / denied / later (detail = trigger + variant). */
import { useEffect, useRef, useState } from 'react';
import { optInDue, optInLast, optInMark, optInVariant, pushAskDone, pushAskLater, pushAskRead, pushAskWrite, pushEnable, pushState,
  type OptInTrigger, type OptInVariant } from './push';
import { openEscape } from './escape';
import { v5LogClient } from './v5Live';
import './push.css';
import './pushOptIn.css';

const EVENT = 'kr8-push-optin';
/** Call after a successful upload ('reel' / 'photo') or when Me opens for a member who has posted ('me'). */
export function pushOptInAsk(by: OptInTrigger) { try { window.dispatchEvent(new CustomEvent<OptInTrigger>(EVENT, { detail: by })); } catch { /* old browser */ } }

/** true on the first app open on this device (the Me moment waits for a later open) */
const FIRST_OPEN = (() => {
  try { const had = localStorage.getItem('kr8_pushopt_open'); localStorage.setItem('kr8_pushopt_open', '1'); return !had; } catch { return true; }
})();

const TX = {
  th: { title: 'อยากรู้ทันทีไหมว่ารีลผ่านแล้ว?', body: 'เปิดการแจ้งเตือน รับข่าวเมื่อรีลผ่าน ริงเข้า และอันดับขยับ', on: 'เปิดการแจ้งเตือน', later: 'ไว้ทีหลัง',
    ios1: 'แตะปุ่มแชร์ ⬆️ ด้านล่าง', ios2: 'แตะ “เพิ่มไปยังหน้าจอโฮม”', iosNote: 'แล้วเปิดกริ๊ง!จากหน้าจอโฮม และเปิดการแจ้งเตือน', gotIt: 'เข้าใจแล้ว',
    okToast: 'เปิดการแจ้งเตือนแล้ว · กริ๊ง!', denied: 'การแจ้งเตือนถูกปิดอยู่ อนุญาตให้ kringapp.com ในการตั้งค่าเบราว์เซอร์', err: 'เปิดการแจ้งเตือนไม่สำเร็จ ลองอีกครั้งในการตั้งค่า' },
  en: { title: 'Want to know the moment your Reel is approved?', body: 'Turn on notifications for approvals, new Rings and rank changes', on: 'Turn on notifications', later: 'Later',
    ios1: 'Tap Share ⬆️ at the bottom', ios2: 'Tap “Add to Home Screen”', iosNote: 'Then open Kring from your Home Screen and turn on notifications', gotIt: 'Got it',
    okToast: 'Notifications on · Kring!', denied: 'Notifications are blocked. Allow them for kringapp.com in your browser settings.', err: 'Couldn’t turn on notifications. Try again in Settings.' },
};
export const optInTx = (lang: string) => (lang === 'th' ? TX.th : TX.en);

export function PushOptInHost(props: { lang: string; blocked: boolean; toast: (m: string) => void; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState<{ by: OptInTrigger; v: OptInVariant } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ by: OptInTrigger; until: number } | null>(null);
  const checking = useRef(false);
  const blockedRef = useRef(props.blocked);
  blockedRef.current = props.blocked;
  const openRef = useRef(false);
  openRef.current = !!open;

  useEffect(() => { props.onOpenChange?.(!!open); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tryShow = async () => {
      const p = pending.current;
      if (!p || checking.current || openRef.current) return;
      if (Date.now() > p.until) { pending.current = null; return; }
      if (blockedRef.current || document.getElementById('a2hs') || document.getElementById('escape') || document.getElementById('goCoach')) return;
      checking.current = true;
      try {
        pending.current = null;
        if (p.by === 'me' && FIRST_OPEN) return;
        if (!optInDue(optInLast(), Date.now())) return;
        const v = optInVariant(await pushState().catch(() => 'unsupported' as const));
        if (!v || blockedRef.current) return;
        optInMark();
        setOpen({ by: p.by, v });
        v5LogClient('push_prompt', 'shown', `${p.by} ${v}`);
      } finally { checking.current = false; }
    };
    const on = (e: Event) => {
      const by = (e as CustomEvent<OptInTrigger>).detail;
      if (by !== 'reel' && by !== 'photo' && by !== 'me') return;
      pending.current = { by, until: Date.now() + 30000 };   // waits (up to 30 s) for whatever else is on screen to close
      window.setTimeout(() => void tryShow(), by === 'me' ? 1500 : 1200);
    };
    window.addEventListener(EVENT, on);
    const t = window.setInterval(() => void tryShow(), 1000);
    return () => { window.removeEventListener(EVENT, on); window.clearInterval(t); };
  }, []);

  if (!open) return null;
  const tx = optInTx(props.lang);
  const det = `${open.by} ${open.v}`;
  const close = () => setOpen(null);
  const later = () => {
    if (busy) return;
    v5LogClient('push_prompt', 'later', det);
    pushAskWrite(pushAskLater(pushAskRead(), Date.now()));   // the older small card stays quiet too
    close();
  };
  const go = async () => {
    if (open.v === 'ios-install') { v5LogClient('push_prompt', 'accepted', det); pushAskWrite(pushAskLater(pushAskRead(), Date.now())); close(); return; }
    if (open.v === 'inapp') { v5LogClient('push_prompt', 'accepted', det); pushAskWrite(pushAskLater(pushAskRead(), Date.now())); close(); openEscape('dings'); return; }
    setBusy(true);
    const r = await pushEnable();
    setBusy(false);
    v5LogClient('push_prompt', r === 'on' ? 'accepted' : r === 'denied' ? 'denied' : 'error', `${det}${r === 'on' || r === 'denied' ? '' : ` ${r}`}`);
    pushAskWrite(pushAskDone(pushAskRead()));
    close();
    props.toast(r === 'on' ? tx.okToast : r === 'denied' ? tx.denied : tx.err);
  };
  const L = props.lang === 'th' ? 'th' : 'en';
  return (
    <div className="kpo-wrap" id="pushOptIn" role="dialog" aria-modal="true" aria-labelledby="kpoH" lang={L} data-variant={open.v} data-by={open.by}>
      <button type="button" className="kpo-scrim" aria-label={tx.later} onClick={later} />
      <div className="kpo">
        <span className="kpo-grab" aria-hidden="true" />
        <div className="kpo-head">
          <span className="kpa-ic kpo-ic" aria-hidden="true"><i /><i /><b /></span>
          <h2 id="kpoH">{tx.title}</h2>
        </div>
        <p className="kpo-body">{tx.body}</p>
        {open.v === 'ios-install' ? (
          <>
            <div className="kpo-steps" id="pushOptInIos">
              <div className="kpo-step"><b>1</b><span className="share" aria-hidden="true" /><small>{tx.ios1}</small></div>
              <div className="kpo-step"><b>2</b><span className="plus" aria-hidden="true">＋</span><small>{tx.ios2}</small></div>
            </div>
            <p className="kpo-note">{tx.iosNote}</p>
          </>
        ) : null}
        <button type="button" className="kpo-go" id="pushOptInOn" disabled={busy} onClick={() => void go()}>{open.v === 'ios-install' ? tx.gotIt : tx.on}</button>
        <button type="button" className="kpo-later" id="pushOptInLater" onClick={later}>{tx.later}</button>
      </div>
    </div>
  );
}
