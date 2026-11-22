import { createRoot } from 'react-dom/client';
import '../src/v8/fonts-v8.css'; import '../src/v8/v8.css'; import '../src/v8/kx.css'; import '../src/v8/rv2.css'; import '../src/v8/rv4.css'; import '../src/v8/glass.css';
import { TasksSheet, tasksSet } from '../src/v8/V5Tasks';
import { WinSheet } from '../src/v8/V5KxRules';
const q = new URLSearchParams(location.search); const lang = q.get('lang') || 'en'; const view = q.get('v') || 'today';
tasksSet({ on: true, day: '2026-11-30', resets_at: new Date(Date.now() + (7*60+40)*60000).toISOString(), verified: true, max: 14, rings_today: 4,
  streak: [false,false,false,false,true,true,true],
  tasks: [
    { id: 'post', rings: 7, question: { id: 'p', body: lang==='th' ? 'สีมงคลของคุณวันนี้' : 'Your lucky colour today' } },
    { id: 'ask', rings: 3, min_chars: 15, question: { id: 'q', body: lang==='th' ? 'ร้านกาแฟเงียบๆ ทำงานได้ แถวอารีย์?' : 'Quiet café to work near Ari?' } },
    { id: 'vote', rings: 1, claimed: true, done: true, vote: { kind:'pair', q_en:'', q_th:'', a_en:'Jodd Fairs', a_th:'จ๊อดแฟร์', a_img:null, b_en:'', b_th:'', b_img:null, c_en:null, c_th:null, img:null, pick:'a', pct:null } },
    { id: 'watch', rings: 1, progress: 2, goal: 3 },
    { id: 'bonus', rings: 2 },
  ] } as any);
const r = { like: 1, save: 3, open: 5, cap: 30, mult: 2, best: 1, floor: 25, prizes: [1500,900,600,500,400,250,150,100] };
createRoot(document.getElementById('r')!).render(
  <div className="v8-app-root" style={{ position:'relative', width:'100vw', height:'100vh', background:`url(${import.meta.env.BASE_URL}media/board/skyline.jpg) center/cover` }}>
    {view === 'today' ? <TasksSheet lang={lang} onClose={()=>{}} onAsk={()=>{}} onFace={()=>{}} /> : <WinSheet v="C" lang={lang} r={r} glass onClose={()=>{}} />}
  </div>);
