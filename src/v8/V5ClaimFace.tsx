/**
 * 0066 · 3-second face check before a prize claim. One screen, Thai with English under it.
 * Runs on the phone (face-api, same models as the Get verified check): hold a straight face in the oval for 3 seconds,
 * then ONE face code (128 numbers) AND one photo frame go with the claim (0075, audit T301-001: the server no longer trusts
 * the face code alone). The frame is uploaded to the private kr8-verify bucket (team-only) so the founder can look at it.
 * The server pays at once only when the code is close to the member's team-approved verified print; otherwise the claim
 * waits for the founder. Camera blocked → friendly retry tips (the claim needs the check).
 */
import { useEffect, useRef, useState } from 'react';
import { faceDescriptor, loadFaceApi, sampleFace } from './v5Face';
import type { FaceSample } from './v5Face';
import { v5LogClient } from './v5Live';

/** Thai line, English line under it */
export const TE = ({ th, en, id }: { th: string; en: string; id?: string }) => (
  <span className="kx-te" id={id}><b lang="th">{th}</b><small lang="en">{en}</small></span>
);

/** a frame that counts towards the 3 seconds: one clear face, centred, near enough, looking straight */
export function goodFrame(f: FaceSample): boolean {
  return f.found && f.centered && f.size > 0.15 && Math.abs(f.yaw - 0.5) < 0.12;
}
export const HOLD_MS = 3000;
/** add one frame's time to the hold; a bad frame drops the hold back to 0 (so it is 3 seconds in a row) */
export function holdNext(heldMs: number, f: FaceSample, dtMs: number): number {
  return goodFrame(f) ? Math.min(HOLD_MS, heldMs + Math.max(0, Math.min(dtMs, 400))) : 0;
}

/** errfix-1 (18 Nov): claim_face_fail TIMEOUT said nothing (#48 iPad in LINE ×8, #67 iPhone: no prize claimed). Counts what the
 *  25 s saw, so the log tells "no face found" from "too far" / "not straight" / "off-centre" / "slow phone" (few frames). */
export interface Seen { n: number; found: number; centered: number; near: number; straight: number; best: number }
export function countSeen(s: Seen, f: FaceSample, heldMs: number): void {
  s.n++;
  if (!f.found) return;
  s.found++;
  if (f.centered) s.centered++;
  if (f.size > 0.15) s.near++;
  if (Math.abs(f.yaw - 0.5) < 0.12) s.straight++;
  s.best = Math.max(s.best, heldMs);
}
export function timeoutWhy(s: Seen, v?: { videoWidth?: number; videoHeight?: number } | null): string {
  return `n${s.n} f${s.found} c${s.centered} near${s.near} st${s.straight} best${Math.round(s.best)}ms ${v?.videoWidth || 0}x${v?.videoHeight || 0}`;
}
type Stage = 'start' | 'loading' | 'look' | 'busy' | 'fail';
function testFeed(): FaceSample[] | null {
  if (import.meta.env.VITE_FACE_TEST !== '1') return null;
  return ((window as unknown as { __kr8FaceFeed?: FaceSample[] }).__kr8FaceFeed) || null;
}

/** one JPEG frame from the camera (the claim photo the founder can check); null if the browser can't make one */
export function grabFrame(v: HTMLVideoElement, max = 480): Promise<Blob | null> {
  try {
    const w = v.videoWidth || 0, h = v.videoHeight || 0;
    if (!w || !h) return Promise.resolve(null);
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext('2d');
    if (!g) return Promise.resolve(null);
    g.drawImage(v, 0, 0, c.width, c.height);
    return new Promise((ok) => { try { c.toBlob((b) => ok(b), 'image/jpeg', 0.82); } catch { ok(null); } });
  } catch { return Promise.resolve(null); }
}

export function ClaimFace(props: { onDone: (face: Float32Array | null, photo?: Blob | null) => void; onCancel: () => void;
  /** preview harness only: show a stage with a still picture instead of the camera */
  demo?: { stage: Stage; img?: string; held?: number } }) {
  const [stage, setStage] = useState<Stage>(props.demo?.stage || 'start');
  const [held, setHeld] = useState(props.demo?.held ?? 0);
  const [failWhy, setFailWhy] = useState<'camera' | 'noface'>('camera');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(false);
  const stop = () => { runRef.current = false; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  useEffect(() => stop, []);

  const start = async () => {
    setStage('loading');
    try {
      const [, stream] = await Promise.all([loadFaceApi(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })]);
      streamRef.current = stream;
      setStage('look');
      requestAnimationFrame(() => void run(stream));
    } catch (e) {
      stop();
      v5LogClient('claim_face_fail', (e as { name?: string })?.name || 'UNKNOWN');
      setFailWhy('camera');
      setStage('fail');
    }
  };

  const run = async (stream: MediaStream) => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    await v.play().catch(() => undefined);
    runRef.current = true;
    let h = 0, last = Date.now(), tries = 0;
    const started = Date.now();
    const seen = { n: 0, found: 0, centered: 0, near: 0, straight: 0, best: 0 };   // errfix-1: why a TIMEOUT happened
    while (runRef.current) {
      if (Date.now() - started > 25000) { stop(); v5LogClient('claim_face_fail', 'TIMEOUT', timeoutWhy(seen, v)); setFailWhy('noface'); setStage('fail'); return; }
      const feed = testFeed();
      const f = feed && feed.length ? (feed.shift() as FaceSample) : v.readyState >= 2 ? await sampleFace(v, 320).catch(() => null) : null;
      const now = Date.now();
      if (f) { h = holdNext(h, f, now - last); setHeld(h); countSeen(seen, f, h); }
      last = now;
      if (h >= HOLD_MS) {
        setStage('busy');
        const photo = await grabFrame(v);
        const d = await faceDescriptor(v).catch(() => null);
        if (d || ++tries >= 3) { stop(); props.onDone(d, photo); return; }
        h = 0; setHeld(0); setStage('look');
      }
      await new Promise((ok) => setTimeout(ok, 90));
    }
  };

  const pct = Math.round((held / HOLD_MS) * 100);
  const secs = Math.max(0, Math.ceil((HOLD_MS - held) / 1000));
  return (
    <div className="kx-cf" id="kxClaimFace" data-stage={stage}>
      <div className="kx-cf-h">
        <TE th="สแกนหน้า 3 วินาที" en="3-second face check" />
        <TE th="ยืนยันใบหน้าสั้น ๆ เพื่อรับรางวัล และให้รีลของคุณติดบอร์ดอันดับ" en="Quick face check to claim your reward and keep your Reel on the ranking board" />
      </div>
      <div className="kx-cf-cam" style={{ ['--p' as string]: `${pct}%` }}>
        {props.demo?.img ? <img src={props.demo.img} alt="" /> : <video ref={videoRef} playsInline muted autoPlay id="kxClaimFaceVideo" />}
        <span className={`kx-cf-oval${held > 0 ? ' on' : ''}${stage === 'busy' ? ' done' : ''}`} />
        <i className="kx-cf-ring" aria-hidden="true" />
        {stage === 'look' ? <em className="kx-cf-n" aria-live="polite">{held > 0 ? secs : ''}</em> : null}
        {stage === 'loading' || stage === 'busy' ? <span className="kx-cf-busy">{stage === 'loading' ? 'กำลังเปิดกล้อง… · Opening camera…' : 'เสร็จแล้ว · Done'}</span> : null}
      </div>
      {stage === 'start' ? (
        <>
          <ul className="kx-cf-tips">
            <li><TE th="มองกล้องตรง ๆ ให้หน้าอยู่ในวงรี" en="Look straight at the camera, face in the oval" /></li>
            <li><TE th="เราเก็บรูปนี้ไว้ 30 วันให้ทีม กริ๊ง! ตรวจ แล้วลบทิ้ง ไม่แสดงให้ใครเห็น" en="We keep this photo for 30 days for the Kring team’s check, then delete it. Nobody else sees it" /></li>
          </ul>
          <button type="button" className="kx-btn tall" id="kxClaimFaceStart" onClick={() => void start()}><TE th="เปิดกล้อง" en="Open camera" /></button>
          <button type="button" className="kx-cf-later" onClick={props.onCancel}><TE th="ย้อนกลับ" en="Back" /></button>
        </>
      ) : null}
      {stage === 'look' ? (
        <p className="kx-cf-say" id="kxClaimFaceSay">{held > 0 ? <TE th="ค้างไว้แบบนี้นะ" en="Hold still" /> : <TE th="มองกล้องตรง ๆ ให้หน้าอยู่ในวงรี" en="Look straight at the camera, face in the oval" />}</p>
      ) : null}
      {stage === 'fail' ? (
        <div className="kx-cf-fail" id="kxClaimFaceFail" role="status">
          {failWhy === 'camera'
            ? <TE th="เปิดกล้องไม่ได้ ลองอนุญาตกล้องในเบราว์เซอร์ หรือเปิด กริ๊ง! ใน Chrome / Safari แล้วลองอีกครั้ง" en="The camera didn’t open. Allow the camera in your browser, or open Kring in Chrome / Safari, then try again." />
            : <TE th="ยังไม่เห็นหน้าชัด ลองไปที่สว่าง ๆ แล้วลองอีกครั้ง" en="We couldn’t see your face clearly. Try somewhere brighter." />}
          <button type="button" className="kx-btn" id="kxClaimFaceRetry" onClick={() => void start()}><TE th="ลองอีกครั้ง" en="Try again" /></button>
          <button type="button" className="kx-cf-later" id="kxClaimFaceBack" onClick={() => { stop(); props.onCancel(); }}>
            <TE th="ไว้ทีหลัง รางวัลของคุณยังอยู่" en="Later · your prize stays here" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
