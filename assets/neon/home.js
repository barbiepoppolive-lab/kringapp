window.__krOK=1;
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
 // only Instagram / Facebook / TikTok / X in-app browsers (sign-in breaks there and they have the menu). A plain Android WebView is NOT blocked: it goes straight to the app.
 var ua=navigator.userAgent,iab=/FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|Twitter/i.test(ua),IOS=/iPhone|iPad|iPod/i.test(ua),sh=D.getElementById('iab'),target='';
 if(sh){
  if(!/Android/i.test(ua)){var ch=sh.querySelector('[data-chrome]');ch&&ch.remove()}
  var sf=sh.querySelector('[data-safari]');if(sf&&!IOS){sf.remove();sf=null}
  if(IOS){var st2=sh.querySelector('[data-ios]');if(st2)st2.textContent=st2.getAttribute('data-ios')}
  var showIab=function(href){target=href;sh.querySelector('.goon').href=target;var cr=sh.querySelector('[data-chrome]');
   if(cr){var u=new URL(target);cr.href='intent://'+u.host+u.pathname+u.search+u.hash+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(target)+';end'}
   if(sf){sf.href='x-safari-'+target}
   sh.classList.add('on')};
  D.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-app]');if(!a||!iab)return;
   var seen=false;try{seen=sessionStorage.getItem('kr_iab')==='1'}catch(_){}if(seen)return;
   e.preventDefault();try{sessionStorage.setItem('kr_iab','1')}catch(_){}showIab(a.href)});
  sh.addEventListener('click',function(e){if(e.target===sh)sh.classList.remove('on')});
  sh.querySelector('.goon').addEventListener('click',function(){sh.classList.remove('on')});
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
 // link-visit counter (supabase 0043_link_visits): 1 row per phone per Bangkok day per ?ref= (anonymous random id kr_vid in localStorage), no cookies, no personal data (kept)
 try{if(/^(localhost|127\.)/.test(location.hostname)||navigator.webdriver)return;var r2=(QS.get('ref')||QS.get('src')||'').toLowerCase();if(!/^[a-z0-9_-]{1,40}$/.test(r2))r2=null;var s=null;try{s=localStorage.getItem('kr_vid')}catch(e){}if(!s||!/^[a-z0-9]{4,40}$/.test(s)){s=(Math.random().toString(36).slice(2,12)+Math.random().toString(36).slice(2,8))||'x';try{localStorage.setItem('kr_vid',s)}catch(e){try{var s2=sessionStorage.getItem('kr_vid');if(s2)s=s2;else sessionStorage.setItem('kr_vid',s)}catch(e2){}}}if(navigator.webdriver&&s.indexOf('zztest')!==0)s=('zztest'+s).slice(0,40);var dy=new Date(Date.now()+252e5).toISOString().slice(0,10),k='kr_lv:'+dy+':'+(r2||'');try{if(localStorage.getItem(k))return;for(var i=localStorage.length-1;i>=0;i--){var kk=localStorage.key(i);if(kk&&kk.indexOf('kr_lv:')===0&&kk.indexOf('kr_lv:'+dy)!==0)localStorage.removeItem(kk)}localStorage.setItem(k,'1')}catch(e){try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(e2){}}var h='';try{h=D.referrer?new URL(D.referrer).hostname:''}catch(e){}var K='sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';setTimeout(function(){try{fetch('https://pedxoxpammnyfnizljyj.supabase.co/rest/v1/link_visits',{method:'POST',keepalive:true,credentials:'omit',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({ref:r2,path:(location.pathname||'/').slice(0,200),referrer:h.slice(0,200)||null,session_id:s})}).catch(function(){})}catch(e){}},0)}catch(e){}
})();
