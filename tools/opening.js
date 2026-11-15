/* Opening: the Kring rings travel in, lock and ring, then a circle wipe opens onto the hero. Inlined into the page by build_home.py so it never waits for a second download. Animation code is the previous home's v6.4 opening, unchanged apart from speed. */
(function(){
 var D=document,H=D.documentElement,op=D.getElementById('op');
 function done(){try{sessionStorage.setItem('kr_op_t',String(Date.now()))}catch(e){}H.classList.remove('opon');H.classList.add('opdone');try{window.dispatchEvent(new Event('kr:opdone'))}catch(e){}}
 addEventListener('pagehide',function(){try{sessionStorage.setItem('kr_op_t',String(Date.now()))}catch(e){}});
 if(!op||!H.classList.contains('opon')){H.classList.add('opdone');return}

 var RM=matchMedia('(prefers-reduced-motion: reduce)').matches,started=false,auto=0,T00=window.__opT0||performance.now(),LATE=performance.now()-T00>560,himg=op&&op.querySelector('.obg'),ready=false,want=0;
 // hold the reveal until the hero picture has decoded, or 3.5 s after the page started, whichever comes first
 function setReady(){if(ready)return;ready=true;if(want)go(want===2)}
 if(!himg)ready=true;else{var chk=function(){if(himg.decode)himg.decode().then(setReady,setReady);else setReady()};if(himg.complete)chk();else{himg.addEventListener('load',chk);himg.addEventListener('error',setReady)}}
 setTimeout(setReady,Math.max(0,3500-(performance.now()-T00)));
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
  var T0=120*F,AP=1800*F,HD=220*F,LK=210*F,D=AP+HD+LK,C=LATE?160:T0+AP+HD+LK*.55,END=LATE?C:T0+D;
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
  if(!LATE){ring('b',-1,[-.6,-.55],[-.78,.38]);
  ring('p',1,[.62,-.42],[.8,.46]);}
  // shimmer: particles drawn in toward the centre
  var ptc=$('.ptc'),sd=7,rnd=function(){sd=(sd*16807)%2147483647;return sd/2147483647},cols=['#fff','#FBE4A8','#FF8FC8','#9AA6FF'];
  for(var i=0;i<(LATE?0:18);i++){var p=document.createElement('i'),sz=2+rnd()*2.6,ag=i/18*6.283+rnd()*.3,r0=(.95+rnd()*.6)*W,r1=.2*W;
   p.style.width=p.style.height=sz.toFixed(1)+'px';p.style.margin=(-sz/2).toFixed(1)+'px';p.style.background=cols[i%4];p.style.boxShadow='0 0 6px '+cols[i%4];ptc.appendChild(p);
   an(p,[{opacity:0,transform:'translate('+(Math.cos(ag)*r0).toFixed(1)+'px,'+(Math.sin(ag)*r0).toFixed(1)+'px) scale(.5)'},{opacity:.95,offset:.45},{opacity:0,transform:'translate('+(Math.cos(ag)*r1).toFixed(1)+'px,'+(Math.sin(ag)*r1).toFixed(1)+'px) scale(1.1)'}],
    {duration:(900+rnd()*350)*F,delay:(650+rnd()*700)*F,easing:'cubic-bezier(.55,0,.85,.55)',fill:'none'})}
  // light builds at the centre, flares on the lock, settles
  if(!LATE)an($('.hl'),[{opacity:0,transform:'scale(.6)'},{opacity:0,transform:'scale(.7)',offset:(T0+AP*.72)/(C+700*FX)},{opacity:.5,transform:'scale(.95)',offset:(T0+AP)/(C+700*FX)},{opacity:.8,transform:'scale(1)',offset:C/(C+700*FX)},{opacity:1,transform:'scale(1.18)',offset:(C+120*FX)/(C+700*FX)},{opacity:.32,transform:'scale(1)'}],{duration:C+700*FX});
  an($('.obg'),[{transform:'scale(1)'},{transform:'scale(1.07)'}],{duration:C,easing:'cubic-bezier(.45,0,.75,.6)'});
  an($('.dk'),[{opacity:.72},{opacity:.4,offset:.6},{opacity:0}],{duration:C+250*FX,easing:'ease-in'});
  // the lock: sparkle, flash, shockwave, camera punch
  an($('.spk'),[{opacity:0,transform:'scale(0) rotate(-120deg)'},{opacity:1,transform:'scale(1.7) rotate(0deg)',offset:.35},{opacity:1,transform:'scale(1) rotate(0deg)'}],{duration:560*FX,delay:C,easing:'cubic-bezier(.2,.8,.3,1)'});
  an($('.fl'),[{opacity:0,transform:'scale(.3)'},{opacity:.95,transform:'scale(1)',offset:.2},{opacity:0,transform:'scale(1.9)'}],{duration:620*FX,delay:C-20,easing:'ease-out',fill:'none'});
  [].forEach.call(op.querySelectorAll('.sw'),function(w,k){an(w,[{opacity:0,transform:'scale(.38)'},{opacity:.9,transform:'scale(.45)',offset:.04},{opacity:0,transform:'scale('+(2.7+k*.5)+')'}],{duration:(820+k*160)*FX,delay:C+k*90*FX,easing:'cubic-bezier(.15,.75,.3,1)',fill:'none'})});
  an($('.cam'),[{transform:'scale(1)'},{transform:'scale(1.02)',offset:.16},{transform:'scale(1)'}],{duration:440*FX,delay:C,easing:'ease-out',fill:'none'});
  // then the words rise in
  if(!LATE)an($('.opt'),[{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'none'}],{duration:620*FX,delay:C+110*F,easing:'cubic-bezier(.2,.8,.2,1)'});
  an($('.opc'),[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:560*FX,delay:C+300*F,easing:'cubic-bezier(.2,.8,.2,1)'});
  if(cta)an(cta,[{opacity:0},{opacity:1}],{duration:500*FX,delay:C+420*F,fill:'backwards'});
  idleT=setTimeout(function(){op.classList.add('idle')},END+350*FX);
  return C;
 }
 function start(tapped){if(started)return;started=true;clearTimeout(auto);if(tapped)bell();if(ready)go(tapped);else want=tapped?2:1}
 function go(tapped){clearTimeout(idleT);AN.forEach(function(x){try{x.finish()}catch(e){}});
  if(RM){op.style.opacity='0';setTimeout(function(){op.classList.add('gone');done()},400);return}
  op.classList.add('ring');setTimeout(function(){op.classList.add('wipe');done()},tapped?260:200);setTimeout(function(){op.classList.add('gone')},960)}
 var lk=RM?0:intro(); // reduced motion: the CSS fade-in is the whole (gentle) opening
 op.addEventListener('click',function(){start(true)});op.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '||e.key==='Escape'){e.preventDefault();start(true)}});
 auto=setTimeout(function(){start(false)},RM?Math.max(300,1300-(performance.now()-T00)):lk+480);
})();
