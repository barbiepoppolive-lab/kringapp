/**
 * r16b (26 Nov, founder): members whose card has no "I am" are asked once per app open until they pick one.
 * Same bottom-sheet look as the notification opt-in (pushOptIn.css). No "Prefer not to say", no "Later": picking is required.
 * Saved with the existing kr8_set_gender call; "Show on my card" stays off unless the member switches it on.
 */
import { useState } from 'react';
import { kxSetGender } from './v5Kx';
import { GenderRow, genderPayload, type Gender } from './V5Gender';
import './pushOptIn.css';

type Tx = (en: string) => string;

export function GenderAskSheet(props: { L: Tx; onSaved: (g: Gender, show: boolean) => void; toast: (m: string) => void }) {
  const { L } = props;
  const [g, setG] = useState<Gender | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [miss, setMiss] = useState(false);
  const save = async () => {
    if (busy) return;
    if (!g) { setMiss(true); return; }
    setBusy(true);
    try {
      const p = genderPayload(g, show);
      const r = await kxSetGender(p.gender, p.show);
      props.onSaved((r.gender || g) as Gender, r.show_gender === true);
    } catch { props.toast(L('Couldn’t save. Try again.')); }
    finally { setBusy(false); }
  };
  return (
    <div className="kpo-wrap" id="genderAsk" role="dialog" aria-modal="true" aria-labelledby="gaH">
      <div className="kpo-scrim" aria-hidden="true" />
      <div className="kpo">
        <span className="kpo-grab" aria-hidden="true" />
        <h2 id="gaH">{L('One quick thing for your card')}</h2>
        <div className="ga-row">
          <GenderRow L={L} value={g} show={show} disabled={busy} required missing={miss && !g}
            onChange={(v, sh) => { if (v) setG(v); setShow(sh); setMiss(false); }} />
        </div>
        <button type="button" className="kpo-go" id="genderAskSave" disabled={busy} onClick={() => void save()}>
          {busy ? L('Saving…') : L('Save')}
        </button>
      </div>
    </div>
  );
}
