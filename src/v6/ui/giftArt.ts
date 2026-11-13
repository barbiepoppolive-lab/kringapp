/* Thai gift line-art (SVG strings), ported from the prototype. */
/* eslint-disable */
// @ts-nocheck
export function giftArt(id: string): string{
 if(id==='garland'){ let s='<g class="swing">'; for(let i=0;i<18;i++){ const a=i/18*Math.PI*2, x=(50+Math.cos(a)*24).toFixed(1), y=(36+Math.sin(a)*24).toFixed(1), deg=(a*180/Math.PI+90).toFixed(0);
   s+=i%3===0?`<circle cx="${x}" cy="${y}" r="5.4" fill="#FFB21E" stroke="#D98200" stroke-width="1"/><circle cx="${x}" cy="${y}" r="2" fill="#FFD067"/>`:`<ellipse cx="${x}" cy="${y}" rx="3.1" ry="5.2" transform="rotate(${deg} ${x} ${y})" fill="#FFFDF4" stroke="#E6DDBF" stroke-width=".8"/>`; }
   s+=`<path d="M50 60v8" stroke="#E6DDBF" stroke-width="1.6"/><circle cx="50" cy="69" r="5.2" fill="#FFB21E" stroke="#D98200"/>${[76,82,88].map(y=>`<ellipse cx="50" cy="${y}" rx="3.3" ry="3.7" fill="#FFFDF4" stroke="#E6DDBF" stroke-width=".8"/>`).join('')}<path d="M47 91l-6 8M53 91l6 8" stroke="#FFB21E" stroke-width="2.4" stroke-linecap="round"/></g>`; return s; }
 if(id==='tea') return `<defs><linearGradient id="teaG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7C988"/><stop offset="1" stop-color="#D9681A"/></linearGradient></defs>
   <path d="M56 6l-5 62" stroke="#7381FF" stroke-width="4" stroke-linecap="round"/><path d="M29 24h42l-6 68H35z" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.6)" stroke-width="1.6"/>
   <path class="teaf" d="M30.6 36h38.8l-5 54.6H35.6z" fill="url(#teaG)"/><path class="swirl" d="M30.6 36c6.5 3.2 13-3.2 19.4 0s13 3.2 19.4 0v7c-6.5 3.2-13-3.2-19.4 0s-13-3.2-19.4 0z" fill="#FFF1DC" opacity=".9"/>
   <rect class="ice" x="37" y="46" width="11" height="11" rx="2.5" fill="rgba(255,255,255,.45)"/><rect class="ice i2" x="52" y="54" width="10" height="10" rx="2.5" fill="rgba(255,255,255,.38)"/><path d="M26 24h48" stroke="rgba(255,255,255,.7)" stroke-width="3" stroke-linecap="round"/><circle class="spark" cx="74" cy="40" r="1.8"/><circle class="spark s2" cx="27" cy="58" r="1.4"/>`;
 if(id==='mango') return `<ellipse cx="50" cy="76" rx="42" ry="11" fill="#1C2257" stroke="rgba(255,255,255,.4)"/><path d="M14 72c2-14 13-21 24-21s20 7 22 21z" fill="#FBF7EC"/>
   ${[[22,62],[28,56],[34,60],[40,55],[46,62],[30,66],[40,66],[50,67]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="2.2" ry="1.2" fill="#ECE4CF"/>`).join('')}
   ${[[30,52],[35,51],[40,50],[45,51]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="1.4" fill="#F2C94C"/>`).join('')}
   <g class="mng"><path d="M48 72c0-17 13-28 30-28 7 0 9 4 7 11-4 11-15 17-37 17z" fill="#FFC23A" stroke="#E08E00" stroke-width="1.3"/><path d="M58 66l9-13M66 69l9-11M74 69l7-8" stroke="#E08E00" stroke-width="1"/></g>
   <path class="drip" d="M20 52c5 3 10 0 15 3s9 0 13 2" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round"/><circle class="spark" cx="86" cy="38" r="2"/><circle class="spark s2" cx="12" cy="44" r="1.6"/>`;
 if(id==='lotus') return `<defs><linearGradient id="lpG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#FFF4D6"/><stop offset="1" stop-color="#FFD067"/></linearGradient></defs>
   <ellipse cx="50" cy="82" rx="36" ry="7" fill="#22533F"/><path d="M20 80c10-4 20-4 30 0" stroke="#3A7A5C" stroke-width="2" fill="none"/>
   <g class="lotus">${[-66,66,-36,36,0].map(a=>`<path class="pet" style="--a:${a}deg" d="M50 76C39 63 39 43 50 26C61 43 61 63 50 76Z" fill="url(#lpG)" stroke="#E2C062" stroke-width="1"/>`).join('')}</g><circle cx="50" cy="66" r="5" fill="#FFB21E"/><circle class="spark" cx="78" cy="30" r="2"/><circle class="spark s2" cx="22" cy="34" r="1.6"/>`;
 if(id==='krathong') return `<g class="wv"><path d="M0 86c8-4 17 4 25 0s17 4 25 0 17 4 25 0 17 4 25 0 17 4 25 0" stroke="#7381FF" stroke-width="2" fill="none" opacity=".7"/></g>
   <g class="bob"><path d="M16 70h68l-9 11H25z" fill="#2E7A52" stroke="#1B5137"/>${[0,1,2,3,4,5].map(i=>`<path d="M${21+i*10.5} 70l5.2-13 5.2 13z" fill="#3E9466" stroke="#1B5137" stroke-width=".8"/>`).join('')}
   <path d="M41 56l-4-19M59 56l4-19" stroke="#C9A06A" stroke-width="1.5"/><circle cx="37" cy="37" r="1.6" fill="#FFB21E"/><circle cx="63" cy="37" r="1.6" fill="#FFB21E"/>
   <circle cx="39" cy="61" r="5.4" fill="#FFB21E"/><circle cx="61" cy="61" r="5.4" fill="#FFFDF4"/><circle cx="50" cy="59" r="6.2" fill="#FFD067"/><rect x="48" y="35" width="4" height="20" rx="1" fill="#FFF3D6"/>
   <circle cx="50" cy="28" r="10" fill="rgba(255,208,103,.25)" class="glowc"/><path class="fl" d="M50 22c-4 6-4 10 0 12 4-2 4-6 0-12z" fill="#FFD067"/></g>`;
 if(id==='lantern') return `<defs><radialGradient id="lnG" cx="50%" cy="68%" r="62%"><stop offset="0" stop-color="#FFF4CC"/><stop offset=".55" stop-color="#FFB547"/><stop offset="1" stop-color="#DA7410"/></radialGradient></defs>
   <circle class="glowc" cx="50" cy="52" r="40" fill="rgba(255,178,30,.2)"/><g class="lsway"><path d="M30 28c0-11 9-17 20-17s20 6 20 17l-4 50H34z" fill="url(#lnG)"/><path d="M42 16l-3 62M58 16l3 62" stroke="rgba(180,95,10,.35)" stroke-width="1"/><path d="M34 78h32" stroke="#B85F0A" stroke-width="2.2" stroke-linecap="round"/><path class="fl" d="M50 68c-3 5-3 8 0 10 3-2 3-5 0-10z" fill="#FFF8D8"/></g>`;
 return '';
}

let GU=0
export const gsvg=(id: string, s: number): string=>{ const u='u'+(++GU); return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" class="gart" aria-hidden="true">${giftArt(id).replace(/(teaG|lpG|lnG)/g,'$1'+u)}</svg>`; }
