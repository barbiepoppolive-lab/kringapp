/**
 * 17 Nov: "Share card" = a clean member pass. Dark Kring card, the ring mark, name + member no., a white QR tile,
 * then two actions: Save image (a PNG of exactly this card) and Share (the phone's own share sheet).
 * No art, no stickers: it has to look like something a member trusts enough to show a stranger.
 */
import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { memberNo } from './kxLogic';
import './shareCard.css';

type Tx = (s: string) => string;

export const cardNo = (raw: string | number | null | undefined): string => {
  const n = Number(String(raw ?? '').replace(/\D/g, ''));
  return memberNo(Number.isFinite(n) && n > 0 ? n : null);
};

function qrModules(value: string): { n: number; dark: (r: number, c: number) => boolean } {
  const q = qrcode(0, 'M');
  q.addData(value);
  q.make();
  return { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}

/** The Kring ring mark: two interlocked rings, blue and pink. */
export const RingMark = ({ size = 28 }: { size?: number }) => (
  <svg width={size * 1.4} height={size} viewBox="0 0 42 30" aria-hidden="true" className="sc-mark">
    <circle cx="15" cy="15" r="11" fill="none" stroke="#5B8CFF" strokeWidth="4" />
    <circle cx="27" cy="15" r="11" fill="none" stroke="#FF4FD8" strokeWidth="4" />
  </svg>
);

export interface ShareCardPerson { name: string; no: string | number | null; photo: string | null; who: 'local' | 'traveller'; link: string }

export function V5ShareCard(props: { L: Tx; p: ShareCardPerson; onShare: () => void; onSaved: (ok: boolean) => void }) {
  const { L, p } = props;
  const qr = useMemo(() => {
    const m = qrModules(p.link);
    let d = '';
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n: m.n, d };
  }, [p.link]);
  const save = () => { void saveCardImage(p, L).then(props.onSaved); };
  return (
    <div className="sc-wrap">
      <div className="sc-card" id="shareCardPass">
        <div className="sc-top">
          <RingMark size={20} />
          <span className="sc-brand">Kring · กริ๊ง!</span>
          <span className="sc-no" data-sc="no">{cardNo(p.no)}</span>
        </div>
        <div className="sc-who">
          <span className="sc-av" style={p.photo ? { backgroundImage: `url('${p.photo}')` } : undefined}>{p.photo ? null : (p.name || '?').charAt(0)}</span>
          <span className="sc-nm"><b data-sc="name">{p.name}</b><small>{p.who === 'local' ? L('Bangkok local') : L('Traveller')}</small></span>
        </div>
        <div className="sc-qr">
          <svg role="img" aria-label="QR code" data-qr={p.link} viewBox={`0 0 ${qr.n} ${qr.n}`} shapeRendering="crispEdges"><path d={qr.d} fill="#0B0A12" /></svg>
        </div>
        <p className="sc-cap">{L('Scan to see my Kring card and follow me')}</p>
      </div>
      <div className="sc-acts">
        <button type="button" className="sc-btn ghost" id="shareCardSave" onClick={save}>{L('Save image')}</button>
        <button type="button" className="sc-btn" id="myCodeShare" onClick={props.onShare}>{L('Share')}</button>
      </div>
    </div>
  );
}

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image();
  i.crossOrigin = 'anonymous';
  i.onload = () => res(i);
  i.onerror = () => res(null);
  setTimeout(() => res(null), 4000);
  i.src = src;
});

/** Draws the same pass on a canvas (1080 wide) and saves it: the phone's share sheet with the file if it can, else a download. */
export async function saveCardImage(p: ShareCardPerson, L: Tx): Promise<boolean> {
  try {
    const W = 1080, H = 1500, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    if (!g) return false;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1B1730'); bg.addColorStop(1, '#0E0C18');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // ring mark
    g.lineWidth = 12;
    g.strokeStyle = '#5B8CFF'; g.beginPath(); g.arc(120, 120, 34, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#FF4FD8'; g.beginPath(); g.arc(160, 120, 34, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 40px system-ui, sans-serif'; g.textBaseline = 'middle';
    g.fillText('Kring · กริ๊ง!', 220, 122);
    g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '700 40px ui-monospace, monospace';
    g.fillText(cardNo(p.no), W - 80, 122);
    g.textAlign = 'left';
    // photo + name
    const img = p.photo ? await loadImg(p.photo) : null;
    g.save(); g.beginPath(); g.arc(160, 300, 80, 0, Math.PI * 2); g.closePath(); g.clip();
    if (img) { const s = Math.max(160 / img.width, 160 / img.height); g.drawImage(img, 160 - (img.width * s) / 2, 300 - (img.height * s) / 2, img.width * s, img.height * s); }
    else { g.fillStyle = '#3A3355'; g.fillRect(80, 220, 160, 160); }
    g.restore();
    g.fillStyle = '#fff'; g.font = '800 64px system-ui, sans-serif'; g.fillText(p.name.slice(0, 22), 280, 280);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '500 38px system-ui, sans-serif';
    g.fillText(p.who === 'local' ? L('Bangkok local') : L('Traveller'), 280, 345);
    // white QR tile
    const m = qrModules(p.link), T = 760, X = (W - T) / 2, Y = 470, pad = 56, cell = (T - pad * 2) / m.n;
    g.fillStyle = '#fff';
    const r = 48;
    g.beginPath(); g.moveTo(X + r, Y); g.arcTo(X + T, Y, X + T, Y + T, r); g.arcTo(X + T, Y + T, X, Y + T, r); g.arcTo(X, Y + T, X, Y, r); g.arcTo(X, Y, X + T, Y, r); g.closePath(); g.fill();
    g.fillStyle = '#0B0A12';
    for (let y = 0; y < m.n; y++) for (let x = 0; x < m.n; x++) if (m.dark(y, x)) g.fillRect(X + pad + x * cell, Y + pad + y * cell, Math.ceil(cell), Math.ceil(cell));
    g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 40px system-ui, sans-serif';
    g.fillText(L('Scan to see my Kring card and follow me'), W / 2, Y + T + 90, W - 120);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '600 34px system-ui, sans-serif';
    g.fillText('kringapp.com', W / 2, H - 70);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) return false;
    const file = new File([blob], `kring-card-${cardNo(p.no).replace('#', '')}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file] }); return true; } catch { return false; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  } catch { return false; }
}
