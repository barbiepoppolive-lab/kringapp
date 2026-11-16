/** The small "turn on dings" card (16 Nov). Shows after a meaningful moment (card minted / first Reel posted), never on first load,
 *  never over a sheet or the install sheet. [Turn on] is the only thing that triggers the browser's permission prompt. */
import { useEffect, useState } from 'react';
import { PUSH_ASK_EVENT, pushAskDone, pushAskLater, pushAskRead, pushAskShow, pushAskWrite, pushConfigured, pushEnable, pushEnvNow, pushSupport } from './push';
import { openEscape } from './escape';
import './push.css';

type Tx = (en: string) => string;
export const PUSH_ASK_LINE = 'Get a ding when you’re verified, your reward is ready, or your Reel goes live';
export const PUSH_IOS_LINE = 'On iPhone, add Kring to your home screen first, then turn on dings';

/** Thai screens show the English line under the Thai one. */
function Two(props: { L: Tx; lang: string; en: string; id?: string }) {
  const main = props.L(props.en);
  return (
    <p className="kpa-line" id={props.id}>
      {main}
      {props.lang === 'th' && main !== props.en ? <small>{props.en}</small> : null}
    </p>
  );
}

export function PushAskCard(props: { L: Tx; lang: string; blocked?: boolean; toast: (m: string) => void; onInstallHelp: () => void }) {
  const { L } = props;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const env = pushEnvNow();
  const support = pushSupport(env, typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0);
  useEffect(() => {
    const check = () => {
      const perm: NotificationPermission = typeof Notification === 'undefined' ? 'denied' : Notification.permission;
      const installOpen = typeof document !== 'undefined' && !!document.getElementById('a2hs');
      setShow(pushAskShow(pushAskRead(), Date.now(), support, perm, { configured: pushConfigured(), blocked: props.blocked || installOpen }));
    };
    check();
    window.addEventListener(PUSH_ASK_EVENT, check);
    const t = setInterval(check, 3000);
    return () => { window.removeEventListener(PUSH_ASK_EVENT, check); clearInterval(t); };
  }, [props.blocked, support]);
  if (!show) return null;
  const later = () => { pushAskWrite(pushAskLater(pushAskRead(), Date.now())); setShow(false); };
  const turnOn = async () => {
    setBusy(true);
    const r = await pushEnable();
    setBusy(false);
    pushAskWrite(pushAskDone(pushAskRead()));
    setShow(false);
    if (r === 'on') props.toast(L('Dings on · กริ๊ง!'));
    else if (r === 'denied') props.toast(L('Dings are blocked. Allow notifications for kringapp.com in your browser settings.'));
    else if (r === 'error') props.toast(L('Could not turn on dings. Try again in Settings.'));
  };
  return (
    <div className="kpa" id="pushAsk" role="dialog" aria-label={L('Dings')} data-variant={support}>
      <span className="kpa-ic" aria-hidden="true"><i /><i /><b /></span>
      <div className="kpa-txt">
        <Two L={L} lang={props.lang} en={support === 'ios-install' ? PUSH_IOS_LINE : PUSH_ASK_LINE} id="pushAskLine" />
        <div className="kpa-btns">
          {support === 'ios-install' ? (
            <button type="button" className="kpa-on" id="pushAskHow" onClick={() => { later(); props.onInstallHelp(); }}>{L('How to add')}</button>
          ) : support === 'inapp' ? (
            <button type="button" className="kpa-on" id="pushAskOn" onClick={() => { pushAskWrite(pushAskLater(pushAskRead(), Date.now())); setShow(false); openEscape('dings'); }}>{L('Turn on')}</button>
          ) : (
            <button type="button" className="kpa-on" id="pushAskOn" disabled={busy} onClick={() => void turnOn()}>{L('Turn on')}</button>
          )}
          <button type="button" className="kpa-later" id="pushAskLater" onClick={later}>{L('Not now')}</button>
        </div>
      </div>
    </div>
  );
}
