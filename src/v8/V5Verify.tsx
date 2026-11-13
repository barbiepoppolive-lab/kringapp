/**
 * "Get verified ✓" (0031): consent (PDPA, face data is sensitive) → front camera → live check on the phone
 * (look straight, turn left, turn right, blink) → compared with the profile photo on the phone → one selfie frame sent
 * to the team → "We check within 24 hours". Skippable; the Me tab keeps a reminder.
 */
import { useEffect, useRef, useState } from 'react';
import { FACE_CONSENT_VERSION, LIVE_START, faceDescriptor, faceDistance, grabFrame, liveNext, loadFaceApi, loadImage, sampleFace } from './v5Face';
import type { FaceSample, LiveState, LiveStep } from './v5Face';
import { v5RequestVerification } from './v5Live';

type Tx = (en: string) => string;
type Stage = 'intro' | 'needphoto' | 'loading' | 'camera' | 'sending' | 'done' | 'error';

const STEP_TEXT: Record<LiveStep, string> = {
  straight: 'Look straight at the camera', left: 'Slowly turn your head to your left', right: 'Now turn to your right', blink: 'Face the camera and close your eyes for one second', done: 'Done · hold still',
};

/** Local test builds only (VITE_FACE_TEST=1): samples pushed to window.__kr8FaceFeed are used before the camera's own. */
function testFeed(): FaceSample[] | null {
  if (import.meta.env.VITE_FACE_TEST !== '1') return null;
  return ((window as unknown as { __kr8FaceFeed?: FaceSample[] }).__kr8FaceFeed) || null;
}

export function V5VerifySheet(props: { L: Tx; photo: string | null; onClose: () => void; onSent: () => void; onAddPhoto: () => void; errText: (e: unknown) => string }) {
  const { L } = props;
  const [stage, setStage] = useState<Stage>(props.photo ? 'intro' : 'needphoto');
  const [agree, setAgree] = useState(false);
  const [live, setLive] = useState<LiveState>(LIVE_START);
  const [err, setErr] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(false);
  const bestRef = useRef<Blob | null>(null);

  const stop = () => {
    runRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  const start = async () => {
    setErr('');
    setStage('loading');
    try {
      const [, stream] = await Promise.all([
        loadFaceApi(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
      ]);
      streamRef.current = stream;
      setStage('camera');
      setLive(LIVE_START);
      requestAnimationFrame(() => void run(stream));
    } catch (e) {
      stop();
      const name = (e as { name?: string })?.name || '';
      setErr(name === 'NotAllowedError' ? L('Camera access was blocked. Allow the camera for kringapp.com in your browser settings, then try again.')
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? L('No front camera found on this device.')
        : L('The face check could not start on this phone. Try again, or try later on another phone.'));
      setStage('error');
    }
  };

  const run = async (stream: MediaStream) => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    await v.play().catch(() => undefined);
    runRef.current = true;
    let state = LIVE_START;
    const started = Date.now();
    while (runRef.current && state.step !== 'done') {
      if (Date.now() - started > 90000) { stop(); setErr(L('That took too long. Try again in good light, face to the camera.')); setStage('error'); return; }
      const feed = testFeed();
      const fast = state.step === 'blink';   // a blink is ~100 ms: in this step read frames back to back, at a smaller size
      const raw = feed && feed.length ? (feed.shift() as FaceSample) : v.readyState >= 2 ? await sampleFace(v, fast ? 224 : 320).catch(() => null) : null;
      const f = raw ? { ...raw, t: raw.t ?? Date.now() } : null;
      if (f && import.meta.env.VITE_FACE_TEST === '1') (window as unknown as { __kr8FaceLast?: FaceSample }).__kr8FaceLast = f;
      if (f) {
        const before = state.step;
        state = liveNext(state, f);
        if (before === 'straight' && state.step === 'left') bestRef.current = await grabFrame(v).catch(() => null);   // the frontal frame is the selfie
        setLive(state);
      }
      await new Promise((ok) => setTimeout(ok, fast ? 0 : 90));
    }
    if (!runRef.current) return;
    await finish(state);
  };

  const finish = async (state: LiveState) => {
    const v = videoRef.current;
    setStage('sending');
    try {
      const selfie = bestRef.current || (v ? await grabFrame(v) : null);
      if (!selfie) throw new Error('FRAME');
      // compare with the profile photo on the phone (the score is only a hint for the team)
      let match: number | null = null;
      try {
        if (props.photo) {
          const url = URL.createObjectURL(selfie);
          const [a, b] = await Promise.all([loadImage(url).then(faceDescriptor), loadImage(props.photo).then(faceDescriptor)]);
          URL.revokeObjectURL(url);
          if (a && b) match = Math.round(faceDistance(a, b) * 1000) / 1000;
        }
      } catch {
        match = null;
      }
      stop();
      await v5RequestVerification(selfie, { straight: state.straight, left: state.left, right: state.right, blink: state.blink, match,
        device: (navigator.userAgent.match(/iPhone|iPad|Android|Mac|Windows|Linux/) || ['other'])[0] }, FACE_CONSENT_VERSION);
      setStage('done');
      props.onSent();
    } catch (e) {
      stop();
      setErr(props.errText(e));
      setStage('error');
    }
  };

  const steps: LiveStep[] = ['straight', 'left', 'right', 'blink'];
  return (
    <div className="v8-sheet kme-sheet kfv" id="sh-verify" data-stage={stage}>
      <div className="grab" />
      <div className="kme-ttl"><b>{L('Get verified ✓')}</b><button type="button" className="xbtn" aria-label="Close" onClick={() => { stop(); props.onClose(); }}>✕</button></div>

      {stage === 'needphoto' && (
        <>
          <p className="kfv-p">{L('Add a clear photo of your face to your card first. The team compares it with your face check.')}</p>
          <button type="button" className="primary-cta" id="verifyAddPhoto" onClick={props.onAddPhoto}>{L('Add a photo')}</button>
          <button type="button" className="kfv-later" onClick={props.onClose}>{L('Not now')}</button>
        </>
      )}

      {stage === 'intro' && (
        <>
          <div className="kfv-steps" aria-hidden="true"><span>🙂</span><span>↶</span><span>↷</span><span>😉</span></div>
          <p className="kfv-p">{L('A 20-second check on your phone: look at the camera, turn left, turn right, blink. Then a Kring team member compares one selfie with your profile photo.')}</p>
          <div className="kfv-consent" id="verifyConsent">
            <b>{L('Your face data')}</b>
            <ul>
              <li>{L('Your face is sensitive personal data under Thailand’s PDPA. We use it only to confirm you are a real person and that your profile photo is you.')}</li>
              <li>{L('The face check runs on your phone. We never store a face scan or face measurements.')}</li>
              <li>{L('We keep one selfie photo, which only the Kring team can see, and delete it 30 days after the review.')}</li>
              <li>{L('Questions or deletion: ops@kringapp.com')}</li>
            </ul>
          </div>
          <label className="kfv-agree">
            <input type="checkbox" id="verifyAgree" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{L('I agree that Kring uses my face this way')}</span>
          </label>
          <button type="button" className="primary-cta" id="verifyStart" disabled={!agree} onClick={() => void start()}>{L('Start camera')}</button>
          <button type="button" className="kfv-later" id="verifyLater" onClick={props.onClose}>{L('Not now · remind me later')}</button>
        </>
      )}

      {(stage === 'loading' || stage === 'camera' || stage === 'sending') && (
        <>
          <div className="kfv-cam">
            <video ref={videoRef} playsInline muted autoPlay id="verifyVideo" />
            <span className={`kfv-oval s-${live.step}`} />
            {stage !== 'camera' && <span className="kfv-busy">{stage === 'loading' ? L('Getting the face check ready…') : L('Sending to the Kring team…')}</span>}
          </div>
          <p className="kfv-say" id="verifyStep" data-step={live.step}>
            {stage === 'camera' && live.step === 'blink' && <span className="kfv-eye" aria-hidden="true"><i /></span>}
            {stage === 'camera' ? L(STEP_TEXT[live.step]) : ''}
          </p>
          <div className="kfv-dots">{steps.map((k) => <i key={k} className={live[k as 'straight'] ? 'on' : live.step === k ? 'now' : ''} />)}</div>
        </>
      )}

      {stage === 'done' && (
        <div className="kfv-done" id="verifyDone">
          <span className="ring">✓</span>
          <b>{L('Sent · we check within 24 hours')}</b>
          <p className="kfv-p">{L('You’ll see ✓ verified on your card when it’s done')}</p>
          <button type="button" className="primary-cta" onClick={props.onClose}>{L('OK')}</button>
        </div>
      )}

      {stage === 'error' && (
        <>
          <p className="kfv-err" id="verifyError" role="status">{err}</p>
          <button type="button" className="primary-cta" onClick={() => void start()}>{L('Try again')}</button>
          <button type="button" className="kfv-later" onClick={props.onClose}>{L('Not now')}</button>
        </>
      )}
    </div>
  );
}
