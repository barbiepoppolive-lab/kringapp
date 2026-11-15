/**
 * Feature 4 · Place tagging: A's post row + full-screen search (A1/A2), B's feed chips (B3) and B's place page (B4).
 * Search = kr8_places first (EN / TH / other spellings + distance if the phone shares it), then the free Photon geocoder
 * (Bangkok box only). A picked Photon result is saved to kr8_places by kr8_add_place.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import './kx.css';
import { cleanPlaceName, distM, fmtDist, fmtN, isMapsLink, KX_AREAS, mapsUrl, parseMapsCoords, togglePick } from './kxLogic';
import { kxAddPlace, kxMemberAddPlace, kxPhoton, kxPlacePage, kxSearchPlaces, placePhoto, type KxPlace, type KxPlacePage, type KxPlaceReel, type KxSavedReel } from './v5Kx';
import { signReelPaths } from './v5Reel';
import { kxArea } from './v5Strings';

type Tx = (en: string) => string;
type Txf = (en: string, a: string, b?: string) => string;
export type PickedPlace = Pick<KxPlace, 'id' | 'name_en' | 'name_th' | 'area' | 'kr_area' | 'photo_url' | 'lat' | 'lng'>;

const RECENT_KEY = 'kr8_recent_places';
export function recentPlaces(): PickedPlace[] {
  try { const j = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(j) ? j.slice(0, 6) : []; } catch { return []; }
}
export function rememberPlaces(list: PickedPlace[]) {
  try {
    const all = [...list, ...recentPlaces()].filter((p, i, a) => /^[0-9a-f-]{36}$/.test(p.id) && a.findIndex((x) => x.id === p.id) === i).slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}
/** Where the phone is, only if the member already allowed location (never asks on its own). */
export function useMyLocation(ask = false): { lat: number; lng: number } | null {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let dead = false;
    const get = () => navigator.geolocation?.getCurrentPosition((p) => { if (!dead) setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); }, () => undefined, { maximumAge: 300000, timeout: 8000 });
    try {
      const perms = (navigator as Navigator & { permissions?: { query: (q: { name: string }) => Promise<{ state: string }> } }).permissions;
      if (ask) get();
      else if (perms) perms.query({ name: 'geolocation' }).then((s) => { if (s.state === 'granted') get(); }).catch(() => undefined);
    } catch { /* no geolocation */ }
    return () => { dead = true; };
  }, [ask]);
  return pos;
}
export const placeName = (lang: string, p: { name_en: string; name_th?: string | null }) => (lang === 'th' && p.name_th ? p.name_th : p.name_en);
const Pin = ({ white, size }: { white?: boolean; size?: number }) => <i className={`kx-pin${white ? ' w' : ''}`} style={size ? { width: size * 0.82, height: size } : undefined} aria-hidden="true" />;
const Thumb = ({ url, size }: { url: string | null | undefined; size: number }) => {
  const src = placePhoto(url);
  return src ? <i className="kx-thumb" style={{ width: size, height: size, backgroundImage: `url('${src}')` }} aria-hidden="true" />
    : <i className="kx-tile" style={{ width: size, height: size }} aria-hidden="true"><Pin white /></i>;
};

/** "Add place · up to 2" row + quick chips (recent / nearby) in the Post a Reel sheet */
export function PlacePickRow(props: { L: Tx; Lf: Txf; lang: string; picked: PickedPlace[]; onOpen: () => void; onChange: (list: PickedPlace[]) => void }) {
  const { L, Lf } = props;
  const pos = useMyLocation(false);
  const [quick, setQuick] = useState<PickedPlace[]>([]);
  useEffect(() => {
    let dead = false;
    const rec = recentPlaces();
    kxSearchPlaces('', pos?.lat ?? null, pos?.lng ?? null, 8).then((r) => {
      if (dead) return;
      const near = (r || []).map((p) => ({ id: p.id, name_en: p.name_en, name_th: p.name_th, area: p.area, kr_area: p.kr_area, photo_url: p.photo_url, lat: p.lat, lng: p.lng }));
      const merged = [...rec, ...(pos ? near : near.filter((p) => ['Talat Noi', 'Lhong 1919', 'Song Wat Road', 'River City Bangkok', 'Ari', 'Benjakitti Forest Park'].includes(p.name_en)))];
      setQuick(merged.filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).slice(0, 8));
    }).catch(() => { if (!dead) setQuick(rec); });
    return () => { dead = true; };
  }, [pos?.lat, pos?.lng]);
  const tap = (p: PickedPlace) => {
    const r = togglePick(props.picked, p);
    if (r.full) { props.onOpen(); return; }
    props.onChange(r.list);
  };
  return (
    <div className="kx-addplace" id="kxAddPlace">
      <button type="button" className="kx-add" id="kxAddPlaceBtn" onClick={props.onOpen}>
        <Pin size={22} /><b>{props.picked.length ? Lf('{0} of 2 places', String(props.picked.length)) : L('Add place')}</b><small>{L('up to 2')}</small><span className="gt">›</span>
      </button>
      <div className="kx-sug" role="list">
        {props.picked.map((p) => (
          <button type="button" key={p.id} className="kx-chip sel" data-place={p.id} onClick={() => tap(p)}><Pin size={14} />{placeName(props.lang, p)} ✕</button>
        ))}
        {quick.filter((q) => !props.picked.some((p) => p.id === q.id)).map((p) => (
          <button type="button" key={p.id} className="kx-chip" data-quick={p.id} onClick={() => tap(p)}><Pin white size={14} />{placeName(props.lang, p)}</button>
        ))}
      </div>
    </div>
  );
}

/** Full-screen place search (A2) */
export function PlaceSearchPage(props: { L: Tx; Lf: Txf; lang: string; picked: PickedPlace[]; onDone: (list: PickedPlace[]) => void; onBack: () => void; toast: (m: string) => void }) {
  const { L, Lf } = props;
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PickedPlace[]>(props.picked);
  const [full, setFull] = useState(false);
  const [ours, setOurs] = useState<KxPlace[] | null>(null);
  const [photon, setPhoton] = useState<KxPlace[]>([]);
  const [askLoc, setAskLoc] = useState(false);
  const pos = useMyLocation(askLoc);
  const [saving, setSaving] = useState('');
  const [adding, setAdding] = useState<null | { name: string; area: string; link: string; busy: boolean; err: string }>(null);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(() => {
      kxSearchPlaces(q, pos?.lat ?? null, pos?.lng ?? null, 20).then((r) => { if (n === seq.current) setOurs(r || []); }).catch(() => { if (n === seq.current) setOurs([]); });
      if (q.trim().length >= 3) kxPhoton(q, pos?.lat, pos?.lng).then((r) => { if (n === seq.current) setPhoton(r); }).catch(() => { if (n === seq.current) setPhoton([]); });
      else setPhoton([]);
    }, q ? 260 : 0);
    return () => clearTimeout(t);
  }, [q, pos?.lat, pos?.lng]);
  const extra = useMemo(() => photon.filter((p) => !(ours || []).some((o) => o.name_en.toLowerCase() === p.name_en.toLowerCase())).slice(0, 6), [photon, ours]);
  const isOn = (id: string) => picked.some((p) => p.id === id);
  const flip = async (p: KxPlace) => {
    if (saving) return;
    let place: PickedPlace = { id: p.id, name_en: p.name_en, name_th: p.name_th, area: p.area, kr_area: p.kr_area, photo_url: p.photo_url, lat: p.lat, lng: p.lng };
    if (!isOn(p.id) && picked.length >= 2) { setFull(true); return; }
    if (p.source === 'photon' && !isOn(p.id)) {
      setSaving(p.id);
      try { const id = await kxAddPlace(p); place = { ...place, id, kr_area: 'Bangkok' }; } catch { props.toast(L('Couldn’t add that place. Try another one.')); setSaving(''); return; }
      setSaving('');
    }
    const r = togglePick(picked, place);
    setFull(r.full || (r.list.length === 2 && !isOn(p.id)));
    setPicked(r.list);
  };
  const dist = (p: KxPlace) => (p.dist_m !== undefined && p.dist_m !== null ? p.dist_m : pos && p.lat && p.lng ? distM(pos.lat, pos.lng, p.lat, p.lng) : null);
  const row = (p: KxPlace) => (
    <button type="button" key={p.id} className={`kx-prow${picked.length >= 2 && !isOn(p.id) ? ' dim' : ''}`} data-place-row={p.name_en} onClick={() => void flip(p)}>
      <Thumb url={p.photo_url} size={46} />
      <span className="t"><b>{p.name_en}{p.status === 'pending' ? <i className="kx-pend">{L('Waiting for check')}</i> : null}</b>
        <span>{p.name_th ? <em className="kx-th2">{p.name_th}</em> : null}<i className="ar">{kxArea(props.lang, p.area, L)}</i>{dist(p) !== null ? <i className="kx-dist">{fmtDist(dist(p))}</i> : null}</span></span>
      <span className={`kx-ck ${isOn(p.id) ? 'on' : 'off'}`}>{saving === p.id ? '…' : isOn(p.id) ? '✓' : '+'}</span>
    </button>
  );
  const recent = recentPlaces().filter((r) => !picked.some((p) => p.id === r.id));
  // B (15 Nov): nothing found → the member can add the place. It is pending until Kring checks it, but works on their Reel now.
  const typed = cleanPlaceName(q);
  const exact = [...(ours || []), ...extra].some((p) => p.name_en.toLowerCase() === typed.toLowerCase() || p.name_th === typed);
  const canAdd = typed.length >= 2 && ours !== null && !exact;
  const startAdd = () => setAdding({ name: typed, area: 'Bangkok', link: '', busy: false, err: '' });
  const saveNew = async () => {
    if (!adding || adding.busy) return;
    const name = cleanPlaceName(adding.name);
    if (name.length < 2) { setAdding({ ...adding, err: L('Type the place name') }); return; }
    if (adding.link && !isMapsLink(adding.link)) { setAdding({ ...adding, err: L('Paste a Google Maps link, or leave it empty') }); return; }
    if (picked.length >= 2) { setFull(true); setAdding(null); return; }
    setAdding({ ...adding, busy: true, err: '' });
    try {
      const p = await kxMemberAddPlace(name, adding.area, adding.link.trim(), parseMapsCoords(adding.link));
      const place: PickedPlace = { id: p.id, name_en: p.name_en, name_th: p.name_th, area: p.area, kr_area: p.kr_area, photo_url: p.photo_url, lat: p.lat, lng: p.lng };
      const r = togglePick(picked, place);
      setPicked(r.list);
      setFull(r.list.length === 2);
      setAdding(null);
      props.toast(p.status === 'pending' ? L('Place added · Kring will check it. Your Reel can use it now.') : L('Place added'));
    } catch {
      setAdding({ ...adding, busy: false, err: L('Couldn’t add that place. Try another one.') });
    }
  };
  return (
    <div className="kx-page kx-ps" id="kxPlaceSearch">
      <div className="kx-hdr">
        <button type="button" className="kx-ib" aria-label={L('Back')} onClick={props.onBack}>‹</button>
        <h2>{L('Add place')}</h2>
        <button type="button" className="kx-lnk" id="kxPlaceDone" onClick={() => { rememberPlaces(picked); props.onDone(picked); }}>{L('Done')}</button>
      </div>
      <label className="kx-srch"><span aria-hidden="true">⌕</span>
        <input id="kxPlaceQ" value={q} placeholder={L('Search places')} autoComplete="off" autoCorrect="off" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
        {q ? <button type="button" className="kx-clr" aria-label={L('Clear')} onClick={() => setQ('')}>✕</button> : null}
      </label>
      {picked.length ? (
        <div className="kx-selr">
          {picked.map((p) => <button type="button" key={p.id} className="kx-chip sel" onClick={() => { setPicked(picked.filter((x) => x.id !== p.id)); setFull(false); }}><Pin size={14} />{placeName(props.lang, p)} ✕</button>)}
          <span className="kx-cnt" id="kxPlaceCount">{Lf('{0} of 2', String(picked.length))}</span>
        </div>
      ) : null}
      {picked.length >= 2 ? <div className={`kx-full${full ? ' flash' : ''}`} id="kxPlaceFull">{L('Full. Tap ✕ on a place to swap it.')}</div> : null}
      <div className="kx-lst">
        {!pos && !q ? <button type="button" className="kx-locask" onClick={() => setAskLoc(true)}><Pin size={14} /> {L('Show places near me')}</button> : null}
        <div className="kx-sec2">{q ? L('On Kring') : pos ? L('Nearby') : L('Popular')}</div>
        {ours === null ? <p className="kx-empty">…</p> : ours.length === 0 && !extra.length ? <p className="kx-empty">{L('No places with that name yet.')}</p> : ours.map(row)}
        {canAdd ? (
          <button type="button" className="kx-addnew" id="kxAddNew" onClick={startAdd}>
            <span className="pl" aria-hidden="true">＋</span>
            <span className="t"><b>{Lf('Add ‘{0}’ as a new place', typed)}</b>{props.lang === 'th' ? <small>Add as new place</small> : <small>{L('Not on Kring yet? Add it.')}</small>}</span>
          </button>
        ) : null}
        {extra.length ? <><div className="kx-sec2">{L('More places in Bangkok')}</div>{extra.map(row)}</> : null}
        {!q && recent.length ? (
          <>
            <div className="kx-sec2">{L('Recent')}</div>
            <div className="kx-rec">{recent.map((p) => (
              <button type="button" key={p.id} className="kx-chip" onClick={() => void flip({ ...p, photo_url: p.photo_url ?? null } as KxPlace)}>↺ {placeName(props.lang, p)}</button>
            ))}</div>
          </>
        ) : null}
      </div>
      {adding ? (
        <div className="kx-newp" id="kxNewPlace" role="dialog" aria-label={L('New place')}>
          <div className="kx-newp-in">
            <div className="kx-hdr"><button type="button" className="kx-ib" aria-label={L('Back')} onClick={() => setAdding(null)}>‹</button><h2>{L('New place')}</h2><span /></div>
            <label className="kx-fl"><span>{L('Place name')}</span>
              <input id="kxNewName" value={adding.name} maxLength={80} autoComplete="off" onChange={(e) => setAdding({ ...adding, name: e.target.value, err: '' })} /></label>
            <div className="kx-fl"><span>{L('Area')}</span>
              <div className="kx-areas" role="radiogroup">{KX_AREAS.map((a) => (
                <button type="button" key={a.name} role="radio" aria-checked={adding.area === a.name} className={`kx-chip${adding.area === a.name ? ' sel' : ''}`} data-area={a.name}
                  onClick={() => setAdding({ ...adding, area: a.name })}>{kxArea(props.lang, a.name, L)}</button>
              ))}</div></div>
            <label className="kx-fl"><span>{L('Google Maps link (optional)')}</span>
              <input id="kxNewLink" value={adding.link} inputMode="url" placeholder="https://maps.app.goo.gl/…" autoComplete="off" onChange={(e) => setAdding({ ...adding, link: e.target.value, err: '' })} /></label>
            <p className="kx-newp-note">{L('Kring checks new places. Your Reel can use it right away.')}</p>
            {adding.err ? <p className="kx-newp-err" role="alert">{adding.err}</p> : null}
            <button type="button" className="kx-btn" id="kxNewSave" disabled={adding.busy} onClick={() => void saveNew()}>{adding.busy ? '…' : L('Add place')}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** B3 chips under the name in the feed */
export function FeedPlaceChips(props: { L: Tx; Lf: Txf; lang: string; places: { id: string; name_en: string; name_th: string | null; photo_url: string | null; area: string; here_now: number }[]; onOpen: (id: string) => void }) {
  const { L, Lf } = props;
  if (!props.places.length) return null;
  return (
    <div className="kx-pls" data-act="places">
      {props.places.map((p, i) => (
        <button type="button" key={p.id} className={`kx-pl${i === 0 ? ' on' : ''}`} data-place-chip={p.id} onClick={(e) => { e.stopPropagation(); props.onOpen(p.id); }}>
          <Thumb url={p.photo_url} size={32} />
          <span><b>{placeName(props.lang, p)}</b>
            {p.here_now > 0 ? <small className="g"><i className="kx-live" />{Lf('{0} here now', String(p.here_now))}</small> : <small>{kxArea(props.lang, p.area, L)}</small>}</span>
        </button>
      ))}
    </div>
  );
}

/** Full-screen Reel player for a tile on the place page */
export function ReelViewer(props: { L: Tx; reel: KxPlaceReel; onClose: () => void }) {
  const [src, setSrc] = useState<{ v?: string; p?: string }>({});
  useEffect(() => {
    let dead = false;
    signReelPaths([props.reel.video_path, props.reel.poster_path]).then((m) => { if (!dead) setSrc({ v: m[props.reel.video_path], p: m[props.reel.poster_path] }); }).catch(() => undefined);
    return () => { dead = true; };
  }, [props.reel]);
  return (
    <div className="kx-viewer" id="kxViewer" role="dialog">
      {src.v ? <video src={src.v} poster={src.p} autoPlay playsInline loop controls /> : <p className="kx-empty">…</p>}
      <button type="button" className="kx-ib abs" aria-label={props.L('Close')} onClick={props.onClose}>✕</button>
      <span className="kx-viewer-by">{props.reel.name}</span>
    </div>
  );
}

/** Me → Saved: grid of the Reels this member saved (kept on the account, newest first). Tap opens the Reel. */
export function SavedReelsPage(props: { L: Tx; Lf: Txf; rows: KxSavedReel[] | null; onBack: () => void; onBrowse: () => void }) {
  const { L, Lf } = props;
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<KxSavedReel | null>(null);
  useEffect(() => {
    let dead = false;
    const paths = (props.rows || []).map((r) => r.poster_path).filter(Boolean);
    if (paths.length) signReelPaths(paths).then((m) => { if (!dead) setPosters(m); }).catch(() => undefined);
    return () => { dead = true; };
  }, [props.rows]);
  const rows = props.rows || [];
  return (
    <div className="kx-page kx-sv" id="kxSaved">
      <div className="kx-hd2">
        <button type="button" className="kx-bk" aria-label={L('Back')} onClick={props.onBack}>‹</button>
        <h1>{L('Saved Reels')}</h1>
        <span className="kx-bp" id="kxSavedCount">{props.rows === null ? '…' : rows.length === 1 ? L('1 Reel') : Lf('{0} Reels', fmtN(rows.length))}</span>
      </div>
      {props.rows === null ? <p className="kx-empty pad">…</p> : rows.length === 0 ? (
        <div className="kx-sv-none" id="kxSavedEmpty">
          <p className="kx-empty">{L('Nothing saved yet. Tap Save on a Reel and it stays here.')}</p>
          <button type="button" className="kx-btn" onClick={props.onBrowse}>{L('See Reels')}</button>
        </div>
      ) : (
        <div className="kx-svgrid" id="kxSavedGrid">
          {rows.map((r) => (
            <button type="button" key={r.id} className="kx-g" data-reel={r.id} style={posters[r.poster_path] ? { backgroundImage: `url('${posters[r.poster_path]}')` } : undefined} onClick={() => setOpen(r)}>
              <span className="by">{r.name}</span><em>♥ {fmtN(r.likes)}</em>
            </button>
          ))}
        </div>
      )}
      {open ? <ReelViewer L={L} reel={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** B4 place page */
export function PlacePage(props: { L: Tx; Lf: Txf; lang: string; id: string; onBack: () => void; onPost: (p: PickedPlace) => void; toast: (m: string) => void; shareUrl: (id: string) => string }) {
  const { L, Lf } = props;
  const [d, setD] = useState<KxPlacePage | null | undefined>(undefined);
  const [tab, setTab] = useState<'top' | 'recent'>('top');
  const [posters, setPosters] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<KxPlaceReel | null>(null);
  const pos = useMyLocation(false);
  useEffect(() => {
    let dead = false;
    setD(undefined);
    kxPlacePage(props.id).then((r) => {
      if (dead) return;
      setD(r);
      const paths = [...(r?.top || []), ...(r?.recent || [])].map((x) => x.poster_path);
      if (paths.length) signReelPaths(paths).then((m) => { if (!dead) setPosters(m); }).catch(() => undefined);
    }).catch(() => { if (!dead) setD(null); });
    return () => { dead = true; };
  }, [props.id]);
  if (d === undefined) return <div className="kx-page kx-pp" id="kxPlace"><p className="kx-empty pad">…</p></div>;
  if (d === null) return (
    <div className="kx-page kx-pp" id="kxPlace">
      <div className="kx-hdr"><button type="button" className="kx-ib" aria-label={L('Back')} onClick={props.onBack}>‹</button></div>
      <p className="kx-empty pad">{L('This place isn’t on Kring any more.')}</p>
    </div>
  );
  const p = d.place;
  const list = tab === 'top' ? d.top : d.recent;
  const hero = placePhoto(p.photo_url) || (d.top[0] && posters[d.top[0].poster_path]) || '';
  const dist = pos ? distM(pos.lat, pos.lng, p.lat, p.lng) : null;
  const cols: KxPlaceReel[][] = [[], []];
  list.forEach((r, i) => cols[i % 2].push(r));
  const share = async () => {
    const url = props.shareUrl(p.id);
    try {
      if (navigator.share) { await navigator.share({ title: `${p.name_en} · Kring`, url }); return; }
      await navigator.clipboard.writeText(url);
      props.toast(L('Link copied'));
    } catch { /* closed */ }
  };
  return (
    <div className="kx-page kx-pp" id="kxPlace" data-place={p.id}>
      <div className={`kx-hero${hero ? '' : ' none'}`} style={hero ? { backgroundImage: `url('${hero}')` } : undefined} />
      <div className="kx-hdr over">
        <button type="button" className="kx-ib" aria-label={L('Back')} onClick={props.onBack}>‹</button>
        <button type="button" className="kx-ib sm" aria-label={L('Share')} onClick={() => void share()}>➦</button>
      </div>
      <div className="kx-nmb">
        {p.name_th ? <div className="tt2">{p.name_th}</div> : null}
        <h1>{p.name_en}</h1>
        <div className="ar"><Pin size={17} />{kxArea(props.lang, p.area, L)}{dist !== null ? <span className="kx-dist">{fmtDist(dist)}</span> : null}</div>
      </div>
      <div className="kx-now">
        {d.here_now > 0 ? (
          <>
            {d.faces.length ? <span className="kx-stack">{d.faces.slice(0, 3).map((f, i) => <i key={i} className="kx-av" style={{ backgroundImage: `url('${f}')` }} />)}</span> : null}
            <b><i className="kx-live" />{Lf('{0} here now', String(d.here_now))}</b>
          </>
        ) : <b className="dimb">{d.reels_count === 1 ? L('1 Reel here') : Lf('{0} Reels here', fmtN(d.reels_count))}</b>}
        <a className="kx-mp" id="kxOpenMaps" href={mapsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">{L('Open in Maps')}</a>
      </div>
      <div className="kx-seg">
        <button type="button" className={tab === 'top' ? 'on' : ''} onClick={() => setTab('top')}>{L('Top')}</button>
        <button type="button" className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>{L('Recent')}</button>
        <span className="cnt">{d.reels_count === 1 ? L('1 Reel') : Lf('{0} Reels', fmtN(d.reels_count))}</span>
      </div>
      {list.length === 0 ? <p className="kx-empty">{L('No Reels here yet. Be the first.')}</p> : (
        <div className="kx-cols">
          {cols.map((c, ci) => (
            <div className="kx-col" key={ci}>
              {c.map((r, i) => (
                <button type="button" key={r.id} className="kx-g" data-reel={r.id} style={{ height: [230, 170, 200, 200][(i * 2 + ci) % 4], ...(posters[r.poster_path] ? { backgroundImage: `url('${posters[r.poster_path]}')` } : {}) }} onClick={() => setOpen(r)}>
                  <em>♥ {fmtN(r.likes)}</em>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {p.photo_credit && placePhoto(p.photo_url) ? <p className="kx-photoby">{L('Photo')}: {p.photo_credit}</p> : null}
      <div className="kx-fd" />
      <button type="button" className="kx-btn kx-fab" id="kxPostHere" onClick={() => props.onPost({ id: p.id, name_en: p.name_en, name_th: p.name_th, area: p.area, kr_area: p.kr_area, photo_url: p.photo_url, lat: p.lat, lng: p.lng })}>
        ＋ {L('Post a Reel here')}
      </button>
      {open ? <ReelViewer L={L} reel={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
