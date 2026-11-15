/* Opening: the Kring rings travel in, lock and ring, then a circle wipe opens onto the hero. Animation code is the previous home's v6.4 opening, unchanged apart from speed. Once per tab session; tap or key skips. */
(function(){
 var D=document,H=D.documentElement,op=D.getElementById('op');
 function done(){H.classList.remove('opon');H.classList.add('opdone');try{window.dispatchEvent(new Event('kr:opdone'))}catch(e){}}
 if(!op||!H.classList.contains('opon')){H.classList.add('opdone');return}
 try{sessionStorage.setItem('kr_op_seen','1')}catch(e){}
 var RM=matchMedia('(prefers-reduced-motion: reduce)').matches,started=false,auto=0;
 function bell(){try{var C=window.AudioContext||window.webkitAudioContext;if(!C)return;var c=new C(),m=c.createGain();m.gain.value=.25;m.connect(c.destination);
  [0,.17].forEach(function(d){var t=c.currentTime+d;[[1,1],[2.01,.55],[2.76,.4],[5.4,.22]].forEach(function(p,i){var o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=1318*p[0];
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(p[1],t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+1.4/(1+i*.7));o.connect(g);g.connect(m);o.start(t);o.stop(t+1.5)})})}catch(e){}}
 var AN=[],idleT=0;
 function intro(){
  op.classList.remove('pre');
  if(!op.animate){op.classList.add('idle');return 0}
  var $=function(q){return op.querySelector(q)},orb=$('.orb'),W=orb.offsetWidth||240,F=.55,FX=.75;
  function an(el,k,o){if(!el)return;o.fill=o.fill||'both';var x=el.animate(k,o);AN.push(x);return x}
  var cta=null;
  if(RM){[$('.br'),$('.opt'),$('.opc')].forEach(function(el,i){an(el,[{opacity:0},{opacity:1}],{duration:500,delay:i*120})});return 600}
  var T0=120*F,AP=1800*F,HD=220*F,LK=210*F,D=AP+HD+LK,C=T0+AP+HD+LK*.55,END=T0+D;
  function Q(t){return t<.78?.85*Math.pow(t/.78,2.2):.85+.15*(1-Math.pow(1-(t-.78)/.22,3))}
  function sm(a,b,x){x=Math.min(1,Math.max(0,(x-a)/(b-a)));return x*x*(3-2*x)}
  function tf(x,y,rx,ry,sc){return 'translate('+x.toFixed(2)+'px,'+y.toFixed(2)+'px) rotateX('+rx.toFixed(2)+'deg) rotateY('+ry.toFixed(2)+'deg) scale('+sc.toFixed(4)+')'}
  function ring(c,d,p0,p1){
   var K=[],G=[],H=[],N=44,i,t,q,u,x,y,o,nm=d*.142*W;
   for(i=0;i<=N;i++){t=i/N;q=Q(t);u=q;
    x=(1-u)*(1-u)*p0[0]*W+2*(1-u)*u*p1[0]*W+u*u*nm;y=(1-u)*(1-u)*p0[1]*W+2*(1-u)*u*p1[1]*W;
    o=t*AP/D;K.push({offset:o,opacity:Math.min(1,t/.1),transform:tf(x,y,24*(1-q),-d*58*Math.pow(1-q,1.2),1/(1+7.5*(1-q)))});
    if(i%4===0){G.push({offset:o,opacity:1-.45*sm(.4,.95,q)});H.push({offset:o,opacity:sm(.12,.85,q)})}}
   K[K.length-1].easing='cubic-bezier(.45,0,.55,1)';
   K.push({offset:(AP+HD)/D,opacity:1,transform:tf(d*.118*W,0,0,-d*3,1),easing:'cubic-bezier(.6,0,.4,1)'});
   K.push({offset:(AP+HD+LK*.62)/D,opacity:1,transform:tf(-d*.014*W,0,0,d*9,1.012),easing:'ease-out'});
   K.push({offset:1,opacity:1,transform:tf(0,0,0,0,1)});
   G.push({offset:(AP+HD)/D,opacity:.85},{offset:(AP+HD+LK*.62)/D,opacity:1},{offset:1,opacity:.42});
   H.push({offset:1,opacity:1});
   var m=$('.rg.m.'+c);an(m,K,{duration:D,delay:T0});an(m.querySelector('.gl'),G,{duration:D,delay:T0});an(m.querySelector('.sh'),H,{duration:D,delay:T0});
   // light trail: echoes on the same path, a beat behind, fading before the near-miss
   [].forEach.call(op.querySelectorAll('.rg.e.'+c),function(e,k){var a0=[.5,.3,.16][k],lim=AP*.93/D;
    an(e,K.filter(function(f){return f.offset<=lim}).map(function(f){var t=f.offset*D/AP;return{offset:f.offset/lim,transform:f.transform,opacity:a0*Math.min(1,t/.12)*(1-sm(.62,.93,t))}}).map(function(f,j,A){if(j===A.length-1)f.offset=1;return f}),{duration:AP*.93,delay:T0+(k+1)*34*F})});
  }
  ring('b',-1,[-.6,-.55],[-.78,.38]);
  ring('p',1,[.62,-.42],[.8,.46]);
  // shimmer: particles drawn in toward the centre
  var ptc=$('.ptc'),sd=7,rnd=function(){sd=(sd*16807)%2147483647;return sd/2147483647},cols=['#fff','#FBE4A8','#FF8FC8','#9AA6FF'];
  for(var i=0;i<18;i++){var p=document.createElement('i'),sz=2+rnd()*2.6,ag=i/18*6.283+rnd()*.3,r0=(.95+rnd()*.6)*W,r1=.2*W;
   p.style.width=p.style.height=sz.toFixed(1)+'px';p.style.margin=(-sz/2).toFixed(1)+'px';p.style.background=cols[i%4];p.style.boxShadow='0 0 6px '+cols[i%4];ptc.appendChild(p);
   an(p,[{opacity:0,transform:'translate('+(Math.cos(ag)*r0).toFixed(1)+'px,'+(Math.sin(ag)*r0).toFixed(1)+'px) scale(.5)'},{opacity:.95,offset:.45},{opacity:0,transform:'translate('+(Math.cos(ag)*r1).toFixed(1)+'px,'+(Math.sin(ag)*r1).toFixed(1)+'px) scale(1.1)'}],
    {duration:(900+rnd()*350)*F,delay:(650+rnd()*700)*F,easing:'cubic-bezier(.55,0,.85,.55)',fill:'none'})}
  // light builds at the centre, flares on the lock, settles
  an($('.hl'),[{opacity:0,transform:'scale(.6)'},{opacity:0,transform:'scale(.7)',offset:(T0+AP*.72)/(C+700*FX)},{opacity:.5,transform:'scale(.95)',offset:(T0+AP)/(C+700*FX)},{opacity:.8,transform:'scale(1)',offset:C/(C+700*FX)},{opacity:1,transform:'scale(1.18)',offset:(C+120*FX)/(C+700*FX)},{opacity:.32,transform:'scale(1)'}],{duration:C+700*FX});
  an($('.obg'),[{transform:'scale(1)'},{transform:'scale(1.07)'}],{duration:C,easing:'cubic-bezier(.45,0,.75,.6)'});
  an($('.dk'),[{opacity:.72},{opacity:.4,offset:.6},{opacity:0}],{duration:C+250*FX,easing:'ease-in'});
  // the lock: sparkle, flash, shockwave, camera punch
  an($('.spk'),[{opacity:0,transform:'scale(0) rotate(-120deg)'},{opacity:1,transform:'scale(1.7) rotate(0deg)',offset:.35},{opacity:1,transform:'scale(1) rotate(0deg)'}],{duration:560*FX,delay:C,easing:'cubic-bezier(.2,.8,.3,1)'});
  an($('.fl'),[{opacity:0,transform:'scale(.3)'},{opacity:.95,transform:'scale(1)',offset:.2},{opacity:0,transform:'scale(1.9)'}],{duration:620*FX,delay:C-20,easing:'ease-out',fill:'none'});
  [].forEach.call(op.querySelectorAll('.sw'),function(w,k){an(w,[{opacity:0,transform:'scale(.38)'},{opacity:.9,transform:'scale(.45)',offset:.04},{opacity:0,transform:'scale('+(2.7+k*.5)+')'}],{duration:(820+k*160)*FX,delay:C+k*90*FX,easing:'cubic-bezier(.15,.75,.3,1)',fill:'none'})});
  an($('.cam'),[{transform:'scale(1)'},{transform:'scale(1.02)',offset:.16},{transform:'scale(1)'}],{duration:440*FX,delay:C,easing:'ease-out',fill:'none'});
  // then the words rise in
  an($('.opt'),[{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'none'}],{duration:620*FX,delay:C+110*F,easing:'cubic-bezier(.2,.8,.2,1)'});
  an($('.opc'),[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:560*FX,delay:C+300*F,easing:'cubic-bezier(.2,.8,.2,1)'});
  if(cta)an(cta,[{opacity:0},{opacity:1}],{duration:500*FX,delay:C+420*F,fill:'backwards'});
  idleT=setTimeout(function(){op.classList.add('idle')},END+350*FX);
  return C;
 }
 function start(tapped){if(started)return;started=true;clearTimeout(auto);clearTimeout(idleT);AN.forEach(function(x){try{x.finish()}catch(e){}});if(tapped)bell();
  if(RM){op.style.opacity='0';setTimeout(function(){op.classList.add('gone');done()},400);return}
  op.classList.add('ring');setTimeout(function(){op.classList.add('wipe');done()},tapped?260:200);setTimeout(function(){op.classList.add('gone')},960)}
 var lk=intro();
 if(RM){op.classList.remove('pre')}
 op.addEventListener('click',function(){start(true)});op.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '||e.key==='Escape'){e.preventDefault();start(true)}});
 auto=setTimeout(function(){start(false)},RM?1400:lk+480);
})();
/* Kring home (neon, 15 Nov 2026). No libraries. */
(function(){
 var D=document,RM=matchMedia('(prefers-reduced-motion: reduce)').matches,TH=D.documentElement.lang==='th';
 // carry ?ref= and ?src= onto app and page links (same behaviour as the previous site)
 var QS=new URLSearchParams(location.search),keep={};
 var ref=QS.get('ref')||'';if(/^[A-Za-z0-9_-]{1,40}$/.test(ref))keep.ref=ref.toLowerCase();
 var src=QS.get('src')||'';if(/^[A-Za-z0-9_-]{2,40}$/.test(src))keep.src=src.toLowerCase();
 function carry(a){try{var u=new URL(a.getAttribute('href'),location.href);for(var k in keep)u.searchParams.set(k,keep[k]);a.href=u.href}catch(e){}}
 D.querySelectorAll('a[data-app],a[data-page],a[data-setlang]').forEach(carry);
 // language switch remembers the choice (same key as the app)
 D.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-setlang]');if(b){try{localStorage.setItem('kr8_lang',b.getAttribute('data-setlang'))}catch(x){}}},true);
 // LINE in-app browser: join through LIFF (kept)
 try{var L=/\bLine\//i.test(navigator.userAgent);var fix=function(a){var u=new URL(a.href,location.href);u.searchParams.set('join','1');if(L){var q=new URLSearchParams();q.set('join','1');var r=u.searchParams.get('ref');if(r)q.set('ref',r);a.href='https://liff.line.me/2012552357-K6nCGLxI?'+q}else a.href=u.href};D.querySelectorAll('a[data-join]').forEach(fix)}catch(e){}
 // Instagram / TikTok / Facebook in-app browsers: offer "open in browser" once (kept)
 var ua=navigator.userAgent,iab=/FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|Twitter|; wv\)/i.test(ua),sh=D.getElementById('iab'),target='';
 if(sh){
  if(!/Android/i.test(ua)){var ch=sh.querySelector('[data-chrome]');ch&&ch.remove()}
  var showIab=function(href){target=href;sh.querySelector('.goon').href=target;var cr=sh.querySelector('[data-chrome]');
   if(cr){var u=new URL(target);cr.href='intent://'+u.host+u.pathname+u.search+u.hash+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(target)+';end'}
   sh.classList.add('on')};
  D.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-app]');if(!a||!iab)return;
   var seen=false;try{seen=sessionStorage.getItem('kr_iab')==='1'}catch(_){}if(seen)return;
   e.preventDefault();try{sessionStorage.setItem('kr_iab','1')}catch(_){}showIab(a.href)});
  sh.addEventListener('click',function(e){if(e.target===sh)sh.classList.remove('on')});
  D.addEventListener('keydown',function(e){if(e.key==='Escape')sh.classList.remove('on')});
  var cp=sh.querySelector('[data-copy]');cp&&cp.addEventListener('click',function(){var done=function(){sh.querySelector('.ok').classList.add('on')};
   try{navigator.clipboard.writeText(target).then(done,function(){prompt('',target)})}catch(_){prompt('',target)}});
 }
 // scroll reveals
 var rv=[].slice.call(D.querySelectorAll('.rv'));
 if(RM||!('IntersectionObserver' in window)){rv.forEach(function(e){e.classList.add('in')})}
 else{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:0});var hr=function(){rv.forEach(function(e){if(e.closest('.hero'))e.classList.add('in')})};if(D.documentElement.classList.contains('opon'))addEventListener('kr:opdone',hr,{once:true});else hr();rv.forEach(function(e){if(!e.closest('.hero'))io.observe(e)})}
 // card sheen and the Reels strip only move while their panel is on screen
 var cp2=D.querySelector('.cardp');if(cp2){if('IntersectionObserver' in window)new IntersectionObserver(function(es){es.forEach(function(e){cp2.classList.toggle('live',e.isIntersecting)})},{rootMargin:'10% 0px'}).observe(cp2);else cp2.classList.add('live')}
 // count-up for Rings on the example board
 function cu(el){var to=+el.getAttribute('data-n');if(RM||!to){el.textContent=to.toLocaleString('en-US');return}var t0=0,d=1100;
  requestAnimationFrame(function st(t){if(!t0)t0=t;var p=Math.min(1,(t-t0)/d);el.textContent=Math.round(to*(1-Math.pow(1-p,3))).toLocaleString('en-US');if(p<1)requestAnimationFrame(st)})}
 var ns=[].slice.call(D.querySelectorAll('[data-n]'));
 if('IntersectionObserver' in window){var co=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){cu(e.target);co.unobserve(e.target)}})},{threshold:.6});ns.forEach(function(e){co.observe(e)})}else ns.forEach(cu);
 // days until opening (Bangkok time); after that day the line simply says it is open
 var dd=D.getElementById('dd');
 if(dd){try{var bk=new Date(Date.now()+7*36e5),today=Date.UTC(bk.getUTCFullYear(),bk.getUTCMonth(),bk.getUTCDate()),p=dd.getAttribute('data-open').split('-'),n=Math.round((Date.UTC(+p[0],+p[1]-1,+p[2])-today)/864e5);
  if(n>0){dd.innerHTML=(TH?'<span>อีก</span><b data-n="'+n+'">'+n+'</b><span>วัน</span>':'<b data-n="'+n+'">'+n+'</b><span>'+(n===1?'day':'days')+' to go</span>');var b=dd.querySelector('b');if(typeof co!=='undefined')co.observe(b)}
  else dd.innerHTML='<span>'+(TH?'เปิดแล้ว':'Open now')+'</span>'}catch(e){}}
 // top bar + floating action
 var top=D.getElementById('top'),fab=D.getElementById('fab'),hero=D.getElementById('hero'),ft=D.querySelector('.ft'),end=D.querySelector('.en2'),ly=scrollY,tk=false;
 function onS(){tk=false;var y=scrollY,vh=innerHeight;top.classList.toggle('bgd',y>40);
  if(y>vh*.6&&y>ly+4)top.classList.add('off');else if(y<ly-4||y<vh*.6)top.classList.remove('off');
  if(fab){var past=y>hero.offsetHeight*.75,near=end&&end.getBoundingClientRect().top<vh*.55;var on=past&&!near;fab.classList.toggle('on',on);fab.querySelector('a').tabIndex=on?0:-1}
  ly=y}
 addEventListener('scroll',function(){if(!tk){tk=true;requestAnimationFrame(onS)}},{passive:true});onS();
 // the card tilts a little with the pointer
 var kc=D.getElementById('kc');
 if(kc&&!RM&&matchMedia('(hover:hover)').matches){var w=kc.parentNode;w.addEventListener('pointermove',function(e){var r=kc.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;kc.style.setProperty('--ry',(x*16).toFixed(1)+'deg');kc.style.setProperty('--rx',(-y*12).toFixed(1)+'deg')});
  w.addEventListener('pointerleave',function(){kc.style.removeProperty('--ry');kc.style.removeProperty('--rx')})}
 // link-visit counter (supabase 0043_link_visits): 1 row per tab session per ?ref=, no cookies, no personal data (kept)
 try{if(/^(localhost|127\.)/.test(location.hostname)||navigator.webdriver)return;var r2=(QS.get('ref')||'').toLowerCase();if(!/^[a-z0-9_-]{1,40}$/.test(r2))r2=null;var k='kr_lv:'+(r2||''),s=null;try{if(sessionStorage.getItem(k))return;s=Math.random().toString(36).slice(2,12)||null;sessionStorage.setItem(k,s||'1')}catch(e){}var h='';try{h=D.referrer?new URL(D.referrer).hostname:''}catch(e){}var K='sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';setTimeout(function(){try{fetch('https://pedxoxpammnyfnizljyj.supabase.co/rest/v1/link_visits',{method:'POST',keepalive:true,credentials:'omit',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({ref:r2,path:(location.pathname||'/').slice(0,200),referrer:h.slice(0,200)||null,session_id:s})}).catch(function(){})}catch(e){}},0)}catch(e){}
})();
