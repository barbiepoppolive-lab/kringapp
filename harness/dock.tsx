/** Tab bar harness: the real KDock over a dark Reel-like screen. ?tab=feed|people|deals|me */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../src/v8/fonts-v8.css';
import '../src/v8/v8.css';
import { KDock, type DockTab } from '../src/v8/KDock';
const q = new URLSearchParams(location.search);
const App = () => {
  const [tab, setTab] = useState<DockTab>((q.get('tab') as DockTab) || 'feed');
  return (
    <div className="v8-app-root" style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <div className="v8-screen active" style={{ position: 'absolute', background: 'url(/v6/photos/wat-arun-temple.jpg) center/cover' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,.7))' }} />
        <div style={{ position: 'absolute', left: 16, bottom: 24, color: '#fff', fontFamily: 'inherit' }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>@mint.bkk</div>
          <div style={{ fontSize: 14, opacity: .9, marginTop: 4 }}>Golden hour at Wat Arun, who wants to join?</div>
        </div>
        <div className="reel-prog"><i style={{ transform: 'scaleX(.42)' }} /></div>
      </div>
      <KDock tab={tab} labels={{ feed: 'Feed', people: 'People', deals: 'Deals', me: 'Me' }} onTap={setTab} />
    </div>
  );
};
createRoot(document.getElementById('root')!).render(<App />);
