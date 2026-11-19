const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];

/* Configuración (config.js): dirección de la plataforma de miembros (appUrl) y de su API (apiUrl).
   apiUrl vacío = mismo dominio; sin apiUrl se usa appUrl; apiUrl false = no enviar resultados. */
const CFG=window.ELEVATION_CONFIG||{}, APP=String(CFG.appUrl||'').replace(/\/+$/,'');
const API=CFG.apiUrl===false?null:String(CFG.apiUrl??APP).replace(/\/+$/,'');
const APP_BASE=/\.html?$/.test(APP)?APP:APP+'/';

/* Navegación entre pantallas: portada y lección de muestra */
const VIEWS=['inicio','leccion'];
let curView=null;
function show(){
  const h=location.hash.slice(1), v=VIEWS.includes(h)?h:'inicio';
  const changed=curView!==v; curView=v;
  VIEWS.forEach(n=>$('#v-'+n).classList.toggle('on',n===v));
  if(changed)scrollTo(0,0);
  // Un enlace a una sección (#s1…#s4) se desplaza hasta ella
  if(v==='inicio'&&h&&h!=='inicio'){const t=document.getElementById(h);if(t)t.scrollIntoView({block:'start'})}
}
addEventListener('hashchange',show);

/* Botones de membresía: llevan a la plataforma (entrar o registrarse, con los datos del test si los hay) */
function appLink(kind){
  if(!APP)return null;
  if(kind!=='registro')return APP_BASE+'#/login';
  const q=new URLSearchParams();
  if(st.name&&!st.demo)q.set('name',st.name.trim());
  if(st.email&&!st.demo)q.set('email',st.email.trim());
  if(st.country&&st.country!=='Otro país')q.set('country',st.country);
  const qs=q.toString(); return APP_BASE+'#/registro'+(qs?'?'+qs:'');
}
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-app]');
  if(a){const url=appLink(a.dataset.app); if(url){a.href=url;return} e.preventDefault(); goTest(); return}
  const g=e.target.closest('[data-go]'); if(g){location.hash=g.dataset.go;return}
  const s=e.target.closest('[data-scroll]'); if(!s)return;
  if(!$('#v-inicio').classList.contains('on')){history.replaceState(null,'','#inicio');show()}
  $('#'+s.dataset.scroll).scrollIntoView({block:'start'});
});
function goTest(){
  if(!$('#v-inicio').classList.contains('on')){history.replaceState(null,'','#inicio');show()}
  $('#s4').scrollIntoView({block:'start'});
}
$('#yr').textContent=new Date().getFullYear();

/* Mapa: cada país es una pieza que se eleva, con su sombra en el suelo */
(()=>{const M=window.ELEV_MAP, el=$('#map3d'); if(!M||!el)return;
  el.innerHTML=`<svg viewBox="0 0 ${M.W} ${M.H}"><g class="ground">${M.c.map(d=>`<path d="${d}"/>`).join('')}</g>${M.c.map((d,i)=>`<path class="c" style="--i:${i}" d="${d}"/>`).join('')}</svg>`;
})();

/* Fases */
const PH=[
 {y:'Año 1–2',span:2,t:'Fundamentos del candidato',tag:'Identidad · Propósito · Formación base',kind:'6 módulos',
  d:'La fase más silenciosa y la más determinante. No ocurre frente a cámaras: instala identidad clara, propósito genuino y la formación mínima para sostener un debate.',
  q:'Un candidato que no se conoce a sí mismo no puede convencer a nadie.',
  u:['Diagnóstico personal','Construcción de narrativa personal','Definición ideológica y posicionamiento','Formación política acelerada','Trabajo de imagen','El mentor']},
 {y:'Año 2–4',span:2,t:'Capital social, redes e identidad política',tag:'Red · Vehículo político · Actores · Redes sociales',kind:'4 pilares',
  d:'Sales al mundo con la base ya instalada. Presencia constante, escucha activa y vínculos genuinos con personas muy distintas entre sí.',
  q:'El capital social no se compra ni se improvisa en campaña.',
  u:['Construcción de capital social','Partido político vs. ruta independiente','Manejo de actores difíciles','Redes sociales como amplificador territorial']},
 {y:'Año 4–6',span:2,t:'La primera apuesta pública',tag:'Cinco rutas · Una decisión · La prueba de fuego',kind:'5 rutas',
  d:'Todo el trabajo anterior se prueba en público por primera vez. Y no siempre significa presentarse a una elección: hay cinco formas legítimas de hacerlo.',
  q:'La primera apuesta pública no tiene que ganarse: tiene que aprenderse.',
  u:['Visibilizador de causa','Constructor de movimiento','Liderazgo cívico sin cargo','Cargo menor de elección popular','Candidatura simbólica estratégica']},
 {y:'Año 6–10',span:4,t:'Posicionamiento y especialización',tag:'Ser referente · Producir contenido · Ampliar alcance',kind:'5 pilares',
  d:'Dejas de ser la promesa emergente y te conviertes en la voz de referencia de un tema. En política, la especialización es una ventaja competitiva.',
  q:'La profundidad precede a la amplitud.',
  u:['Elección y dominio del territorio temático','Producción de contenido de autoridad','Ampliación del alcance','Construcción de estructura política propia','Alianzas estratégicas']}
];
let cur=0;
function phases(){
  $('#track').innerHTML=PH.map((p,i)=>`<button role="tab" aria-selected="${i===cur}" data-ph="${i}"><b>${i+1}</b><span><strong>${p.t}</strong><small>${p.y.replace('Año','Años')}</small></span></button>`).join('');
  const p=PH[cur];
  $('#phase').innerHTML=`<div><h3>${p.t}</h3><p class="tag">${p.tag}</p><p>${p.d}</p><blockquote>${p.q}</blockquote></div>
   <div><p class="units-h">${p.kind}</p><ol class="units">${p.u.map(x=>`<li>${x}</li>`).join('')}</ol></div>`;
}
$('#track').addEventListener('click',e=>{const b=e.target.closest('[data-ph]');if(b){cur=+b.dataset.ph;phases();$('#track [aria-selected="true"]').focus()}});
phases();

/* Contador del ejercicio: ~140 palabras por minuto en voz alta (estimación) */
$('#narr').addEventListener('input',e=>{
  const w=(e.target.value.trim().match(/\S+/g)||[]).length, s=Math.round(w/140*60);
  $('#ncount').textContent=`${w} palabras · ${s} s en voz alta`;
  $('#nbar').style.width=Math.min(100,s/90*100)+'%';
});

/* Test ideológico latinoamericano. Datos: data/test-data.js (generado de los JSON del paquete).
   Cálculo sin cambios: puntaje por respuesta de preguntas.json, promedio por eje, 9 zonas con umbrales 2.5 y 3.5,
   similitud = 100 × (1 − distancia / 5.66), aviso si el partido más cercano está a más de 1.5. */
const T=window.ELEV_TEST, MAXD=5.66, GAP=1.5, NQ=T.Q.length;
const st={step:-1,country:'Venezuela',ans:new Array(NQ).fill(null)};
const COUNTRIES=[...new Set(T.L.map(l=>l.c)),'Otro país'];
const LIK=['Totalmente en desacuerdo','En desacuerdo','Neutral','De acuerdo','Totalmente de acuerdo'];
const STOP={de:1,del:1,la:1,las:1,los:1,el:1,y:1,al:1,da:1,von:1};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const r1=v=>Math.round(v*10)/10;
function scores(){
  const s={economia:0,orden:0},c={economia:0,orden:0};
  T.Q.forEach((q,i)=>{const a=st.ans[i]; if(a==null)return; s[q.eje]+=q.pts[a-1]; c[q.eje]++});
  return {e:c.economia?r1(s.economia/c.economia):3, p:c.orden?r1(s.orden/c.orden):3};
}
const zoneOf=(e,p)=>T.GRID[p>=3.5?0:p<=2.5?2:1][e<=2.5?0:e>=3.5?2:1];
const dist=(e,p,o)=>Math.hypot(e-o.e,p-o.p);
const pct=d=>Math.round(100*(1-d/MAXD));
const rank=(list,e,p)=>list.map(o=>({o,d:dist(e,p,o)})).sort((a,b)=>a.d-b.d);
function initials(n){
  const w=n.replace(/\s*\(.*?\)/g,'').split(/\s+/).filter(x=>x&&!STOP[x.toLowerCase()]);
  return w.length===1?w[0].slice(0,2).toUpperCase():(w[0][0]+w[w.length-1][0]).toUpperCase();
}
function acronym(n){
  const m=n.match(/\(([^)]+)\)/); if(m)return m[1];
  if(n===n.toUpperCase())return n;
  const w=n.split(/\s+/); if(w.length===1)return n.toUpperCase().slice(0,7);
  return w.filter(x=>!STOP[x.toLowerCase()]).map(x=>x[0].toUpperCase()).join('');
}
function tav(o,kind,size){
  const g=T.Z[zoneOf(o.e,o.p)].g, t=kind==='p'?acronym(o.n):initials(o.n);
  const fs=Math.round(size*(t.length>4?.24:t.length>3?.28:t.length>2?.34:.4));
  return `<span class="tav${kind==='p'?' sq':''}" style="width:${size}px;height:${size}px;font-size:${fs}px;background:linear-gradient(145deg,${g[0]},${g[1]})" role="img" aria-label="${esc(o.n)}">${esc(t)}${o.i?`<img src="img/test/${o.i}" alt="" loading="lazy" onerror="this.remove()">`:''}</span>`;
}

function plot(e,p,tops,you){
  const S=340,pad=22,w=S-2*pad, X=v=>pad+(v-1)/4*w, Y=v=>S-pad-(v-1)/4*w;
  const xs=[pad,X(2.5),X(3.5),S-pad], ys=[pad,Y(3.5),Y(2.5),S-pad];
  let s=`<svg class="plot" viewBox="0 0 ${S} ${S+20}" role="img" aria-label="Brújula con tu posición" font-family="Outfit,sans-serif">
   <defs><clipPath id="pclip"><rect x="${pad}" y="${pad}" width="${w}" height="${w}" rx="20"/></clipPath></defs><g clip-path="url(#pclip)"><rect x="${pad}" y="${pad}" width="${w}" height="${w}" fill="#fff"/>`;
  T.GRID.forEach((row,r)=>row.forEach((k,c)=>{s+=`<rect x="${xs[c]}" y="${ys[r]}" width="${xs[c+1]-xs[c]}" height="${ys[r+1]-ys[r]}" fill="${T.Z[k].g[0]}" fill-opacity=".2"/>`}));
  [2.5,3.5].forEach(v=>{s+=`<path d="M${X(v)} ${pad}V${S-pad}M${pad} ${Y(v)}H${S-pad}" stroke="#fff" stroke-width="3"/>`});
  s+=`</g><rect x="${pad}" y="${pad}" width="${w}" height="${w}" rx="20" fill="none" stroke="#c9c7d4" stroke-width="1"/>`;
  [['ea',pad+12,pad+20,'start'],['dc',S-pad-12,pad+20,'end'],['ip',pad+12,S-pad-12,'start'],['ll',S-pad-12,S-pad-12,'end']].forEach(a=>{
    s+=`<text x="${a[1]}" y="${a[2]}" font-size="10" font-weight="600" fill="#0d0c16" fill-opacity=".7" text-anchor="${a[3]}">${T.Z[a[0]].short}</text>`});
  s+=`<text x="${S/2}" y="${S+12}" font-size="10.5" font-weight="600" fill="#5a596b" text-anchor="middle">Economía: más Estado ← → más mercado</text>
   <text transform="translate(11 ${S/2}) rotate(-90)" font-size="10.5" font-weight="600" fill="#5a596b" text-anchor="middle">libertades ← → control</text>`;
  T.L.forEach(l=>{s+=`<circle cx="${X(l.e)}" cy="${Y(l.p)}" r="2.6" fill="#373596" fill-opacity=".28"/>`});
  tops.forEach((t,ti)=>{
    const x=X(t.o.e),y=Y(t.o.p),g=T.Z[zoneOf(t.o.e,t.o.p)].g, txt=t.kind==='p'?acronym(t.o.n):initials(t.o.n);
    const shape=(r,extra)=>t.kind==='p'?`<rect x="${x-r}" y="${y-r}" width="${2*r}" height="${2*r}" rx="${r*.5}" ${extra}/>`:`<circle cx="${x}" cy="${y}" r="${r}" ${extra}/>`;
    s+=shape(13,`fill="${g[0]}" stroke="#fff" stroke-width="2"`).replace('/>',`><title>${esc(t.o.n)}</title>`+(t.kind==='p'?'</rect>':'</circle>'));
    if(t.o.i)s+=`<clipPath id="tc${ti}">${shape(11.5,'')}</clipPath><image href="img/test/${t.o.i}" x="${x-11.5}" y="${y-11.5}" width="23" height="23" clip-path="url(#tc${ti})" preserveAspectRatio="xMidYMid slice"/>`;
    else s+=`<text x="${x}" y="${y+3}" font-size="${txt.length>3?6:txt.length>2?7:8.5}" font-weight="800" fill="#0d0c16" text-anchor="middle">${esc(txt)}</text>`;
  });
  if(you)s+=`<g class="you" style="transform:translate(${X(e)}px,${Y(p)}px)"><circle class="pulse" r="15" fill="none" stroke="#373596" stroke-width="1.5"/><circle r="13" fill="#373596" stroke="#ffd84d" stroke-width="3"/><text y="3.6" font-size="10" font-weight="600" fill="#fff" text-anchor="middle">Tú</text></g>`;
  return s+'</svg>';
}
const side=(title,note)=>{const sc=scores();return `<div class="live"><p>${title}</p>${plot(sc.e,sc.p,[],true)}<small>${note}</small></div>`};

const ISO={'Venezuela':'ve','México':'mx','Colombia':'co','Argentina':'ar','Chile':'cl','Perú':'pe','Brasil':'br','Ecuador':'ec','Bolivia':'bo','Uruguay':'uy','Cuba':'cu','Nicaragua':'ni','El Salvador':'sv','Panamá':'pa','Costa Rica':'cr','Guatemala':'gt','Honduras':'hn','Paraguay':'py','República Dominicana':'do'};
const flag=c=>ISO[c]?`<img class="fl" src="img/flags/${ISO[c]}.svg" alt="">`:`<svg class="fl gl" viewBox="0 0 24 18" aria-hidden="true"><rect width="24" height="18" fill="#dddcf4"/><circle cx="12" cy="9" r="6" fill="none" stroke="#373596" stroke-width="1.4"/><path d="M6 9h12M12 3c-3 3.5-3 8.500 0 12M12 3c3 3.500 3 8.500 0 12" fill="none" stroke="#373596" stroke-width="1.2"/></svg>`;
function tIntro(){
  return `<form class="qa" id="t-form" novalidate><p class="qn">${NQ} afirmaciones · 3 minutos</p>
   <h3 class="i">Descubre dónde te ubicas en economía y en orden y valores, y a qué líderes y partidos de tu país te pareces.</h3>
   <div class="fields">
    <label class="fld"><span>Tu nombre</span><input id="t-name" type="text" autocomplete="given-name" placeholder="¿Cómo te llamas?" value="${esc(st.name||'')}" data-f></label>
    <label class="fld"><span>Tu correo electrónico</span><input id="t-email" type="email" autocomplete="email" placeholder="nombre@correo.com" value="${esc(st.email||'')}"></label>
    <div class="fld wide"><span id="lbl-pais">¿De qué país eres?</span>
     <div class="dd"><button type="button" class="dd-b" id="t-pais" data-act="dd" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="lbl-pais t-pais">${flag(st.country)}<span>${esc(st.country)}</span></button>
      <div class="dd-l" role="listbox" aria-labelledby="lbl-pais" hidden>${COUNTRIES.map(c=>`<button type="button" role="option" aria-selected="${c===st.country}" data-c="${esc(c)}">${flag(c)}<span>${esc(c)}</span></button>`).join('')}</div></div></div>
   </div>
   <p class="err" id="t-err" role="alert"></p>
   <div class="cta" style="margin-top:0"><button type="submit" class="btn sun" data-act="start">Empezar</button><button type="button" class="btn ghost" data-act="demo">Ver un ejemplo de resultado</button></div>
   <p class="fine">${APP?'Con tu nombre y tu correo guardamos tu resultado y te ayudamos a crear tu perfil en la red al terminar el test.':'Al terminar podrás crear tu perfil en la red de Elevation con estos datos.'}</p></form>
   ${side('La brújula','Cada punto es un líder de la región. Tú empiezas en el centro.')}`;
}
function tQuestion(){
  const i=st.step,q=T.Q[i],cur=st.ans[i];
  return `<div class="qa"><div class="steps" role="img" aria-label="Afirmación ${i+1} de ${NQ}">${T.Q.map((_,k)=>`<i class="${k<i?'d':k===i?'c':''}"></i>`).join('')}</div>
   <div class="qrow"><p class="qn">Afirmación ${i+1} de ${NQ}</p><span class="axis ${q.eje}">${q.eje==='economia'?'Economía':'Orden y valores'}</span></div>
   <h3>${esc(q.t)}</h3>
   <div class="scale">${LIK.map((l,k)=>`<button data-v="${k+1}" aria-pressed="${cur===k+1}"${k===2?' data-f':''}><b>${k+1}</b><span>${l}</span></button>`).join('')}</div>
   <div class="qnav"><button class="back" data-act="prev">${i?'Anterior':'Volver a mis datos'}</button>${cur!=null?`<button class="back" data-act="next">${i===NQ-1?'Ver resultado':'Siguiente'}</button>`:''}</div></div>
   ${side('Tu posición en vivo',i?'Se mueve con cada respuesta.':'Responde y mira cómo se mueve.')}`;
}
function meter(label,v,l,r){
  return `<div class="tm"><div class="mh"><span>${label}</span><b>${v.toFixed(1)}</b></div><div class="mt"><i style="left:${(v-1)/4*100}%"></i></div><div class="mf"><span>${l}</span><span>${r}</span></div></div>`;
}
function mcard(m,kind,top){
  const q=pct(m.d),z=T.Z[zoneOf(m.o.e,m.o.p)];
  return `<article class="mc${top?' top':''}">${top?'<span class="mb">Más parecido</span>':''}<div class="mc-t">${tav(m.o,kind,64)}<div class="ring" style="--p:${q};--c:${z.g[1]}"><span>${q}%</span></div></div><h5>${esc(m.o.n)}</h5><small>${z.short}</small></article>`;
}
function tResult(){
  const {e,p}=scores(), z=T.Z[zoneOf(e,p)], country=st.country, has=country!=='Otro país';
  const allL=rank(T.L,e,p), region=allL.slice(0,3), far=allL[allL.length-1], best=allL[0];
  const locL=has?allL.filter(m=>m.o.c===country):[], locP=has?rank(T.P.filter(q=>q.c===country),e,p):[];
  const none='<p class="fine">Elige un país al inicio del test para ver los líderes y los partidos de tu país.</p>';
  const lead=!has?none:locL.length?`<div class="rail">${locL.slice(0,3).map((m,i)=>mcard(m,'l',!i)).join('')}</div>`:`<p class="fine">Aún no hay líderes de ${esc(country)} codificados.</p>`;
  let part=none;
  if(has)part=locP.length?`<div class="rail">${locP.slice(0,3).map((m,i)=>mcard(m,'p',!i)).join('')}</div>`+(locP[0].d>GAP?`<p class="notice"><b>Ningún partido de ${esc(country)} queda cerca de tu perfil.</b> El más cercano está a ${locP[0].d.toFixed(1)} puntos en la brújula; el umbral es ${GAP.toFixed(1)}.</p>`:''):`<p class="fine">Aún no hay partidos de ${esc(country)} codificados.</p>`;
  const tops=has?[...locL.slice(0,3).map(m=>({o:m.o,kind:'l'})),...locP.slice(0,3).map(m=>({o:m.o,kind:'p'}))]:region.map(m=>({o:m.o,kind:'l'}));
  st.share=`Mi perfil en el Test Ideológico Latinoamericano de Elevation: Economía ${e.toFixed(1)} · Orden y valores ${p.toFixed(1)} (${z.name}). Líder más parecido: ${best.o.n} (${pct(best.d)}%).`+(locP.length?` Partido más cercano en ${country}: ${locP[0].o.n} (${pct(locP[0].d)}%).`:'');
  return `<div class="res">
   <div class="rtop">
    <div class="rcol">
     <section class="zcard" style="--g0:${z.g[0]};--g1:${z.g[1]}"><p class="qn">${st.name&&!st.demo?esc(st.name.trim().split(/\s+/)[0])+", tu resultado":"Tu resultado"}</p><h3 class="r" tabindex="-1" data-f>${esc(z.name)}</h3><p>${esc(z.desc)}</p></section>
     <section class="box">${meter('Economía',e,'Más Estado','Más mercado')}${meter('Orden y valores',p,'Más libertades','Más control')}</section>
     <p class="hook">Esto es un punto de partida, no una etiqueta. En la Fase 1 lo conviertes en un posicionamiento que resista un debate.</p>
     <div class="cta" style="margin:0"><a class="btn sun" href="#s4" data-app="registro">Crear mi perfil y empezar</a><button class="btn ghost" data-act="reset">Repetir el test</button></div>
    </div>
    <section class="box pl"><h4>Tu brújula</h4>${plot(e,p,tops,true)}<p class="legend"><span>● Líder</span><span>■ Partido</span><span>Puntos tenues: resto de la región</span></p></section>
   </div>
   <div class="rtwo">
    <section><h4>${has?flag(country):''}Líderes${has?' de '+esc(country):''} a los que te pareces</h4>${lead}</section>
    <section><h4>${has?flag(country):''}Partidos${has?' de '+esc(country):''} más cercanos</h4>${part}</section>
   </div>
   <div class="rtwo">
    <section class="box"><h4>En toda la región</h4>${region.map(m=>`<div class="mini">${tav(m.o,'l',46)}<div><b>${esc(m.o.n)}</b><small>${esc(m.o.c)}</small></div><span class="pc2">${pct(m.d)}%</span></div>`).join('')}
     <p class="fine" style="margin-top:10px">Más lejano a ti: ${esc(far.o.n)} (${esc(far.o.c)}), ${pct(far.d)}%.</p></section>
    <section class="box"><h4>Compartir</h4><label for="t-share" class="sr">Texto para compartir</label><textarea id="t-share" readonly>${esc(st.share)}</textarea>
     <div class="qnav" style="justify-content:flex-start;gap:14px"><button class="btn ghost sm" data-act="copy">Copiar resultado</button><span id="t-copied" class="fine" role="status"></span></div></section>
   </div>
   <details class="box"><summary>Cómo se calcula</summary>
    <p>Cada afirmación suma de 1 a 5. En las formuladas desde la izquierda la escala se invierte, de modo que 5 siempre es el lado derecho. Cada eje es el promedio de sus 10 afirmaciones. 2.5 o menos es izquierda en ese eje, 3.5 o más es derecha y lo intermedio es centro.</p>
    <p>El parecido con cada líder o partido es 100% menos la distancia en la brújula dividida por la máxima posible (5.66). Si el partido más cercano supera 1.5 de distancia, el resultado avisa que ninguno te representa.</p>
    <p>Líderes y partidos se codificaron con las mismas 20 afirmaciones: los líderes por lo que gobernaron y los partidos por su plataforma y votación legislativa.</p></details>
   <p class="fine">Prototipo. Las coordenadas de líderes y partidos son estimaciones preliminares, pendientes de validación por un panel de expertos. Las imágenes provienen de Wikipedia y cada una tiene su propia licencia; donde falta imagen se muestran las iniciales.</p>
  </div>`;
}
function sendLead(){
  if(!APP||API===null||st.demo||st.sent||!st.email)return;
  st.sent=true;
  const {e,p}=scores();
  fetch(API+'/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},mode:API?'cors':'same-origin',
    body:JSON.stringify({name:st.name,email:st.email,country:st.country,economia:e,orden:p,zona:T.Z[zoneOf(e,p)].name,answers:st.ans})}).catch(()=>{st.sent=false});
}
function itest(move){
  const c=$('#test-card'), mode=st.step<0?'intro':st.step>=NQ?'result':'ask';
  if(mode==='result')sendLead();
  c.className='arena '+mode;
  c.innerHTML=mode==='intro'?tIntro():mode==='ask'?tQuestion():tResult();
  if(move){ if(mode!=='ask')c.scrollIntoView({block:'start'}); const f=c.querySelector('[data-f]'); if(f)f.focus({preventScroll:true}); }
}
$('#test-card').addEventListener('click',ev=>{
  const b=ev.target.closest('button'); if(!b||b.dataset.go)return;
  if(b.dataset.c){
    st.country=b.dataset.c; const d=$('#t-pais');
    d.innerHTML=flag(st.country)+'<span>'+esc(st.country)+'</span>';
    $$('#test-card .dd-l button').forEach(x=>x.setAttribute('aria-selected',x===b));
    ddOpen(false); d.focus(); return;
  }
  if(b.dataset.act==='dd'){ddOpen($('#test-card .dd-l').hidden); return}
  if(b.dataset.v){st.ans[st.step]=+b.dataset.v; st.step++; return itest(true)}
  const a=b.dataset.act;
  if(a==='start'){
    ev.preventDefault(); st.demo=false; const n=$('#t-name'),m=$('#t-email'),er=$('#t-err');
    st.name=n.value.trim(); st.email=m.value.trim();
    if(!st.name){er.textContent='Escribe tu nombre para empezar.';n.focus();return}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(st.email)){er.textContent='Escribe un correo válido, por ejemplo nombre@correo.com.';m.focus();return}
    st.step=0;
  }
  else if(a==='prev')st.step--;
  else if(a==='next')st.step++;
  else if(a==='reset'){st.ans.fill(null);st.step=-1;st.demo=false;st.sent=false}
  else if(a==='demo'){ /* Perfil de ejemplo del prototipo: mercado alto y libertades altas */
    const E=[5,4,4,5,5,4,4,4,4,4],P=[2,2,2,2,1,2,3,2,2,2];
    st.ans=T.Q.map((q,i)=>q.pts.indexOf((q.eje==='economia'?E:P)[Math.floor(i/2)])+1); st.step=NQ; st.demo=true; }
  else if(a==='copy'){
    const out=$('#t-copied'),ta=$('#t-share'),fail=()=>{ta.select();out.textContent='Selecciona y copia el texto'};
    try{navigator.clipboard.writeText(st.share).then(()=>{out.textContent='Copiado'},fail)}catch(err){fail()}
    return;
  } else return;
  itest(true);
});
function ddOpen(on){
  const l=$('#test-card .dd-l'), d=$('#t-pais'); if(!l)return;
  l.hidden=!on; d.setAttribute('aria-expanded',on);
  if(on){const cur=l.querySelector('[aria-selected="true"]')||l.firstElementChild; cur.focus(); cur.scrollIntoView({block:'nearest'})}
}
document.addEventListener('click',ev=>{if(!ev.target.closest('.dd'))ddOpen(false)});
$('#test-card').addEventListener('keydown',ev=>{
  const l=$('#test-card .dd-l'); if(!l||l.hidden)return;
  if(ev.key==='Escape'){ddOpen(false);$('#t-pais').focus();return}
  if(ev.key!=='ArrowDown'&&ev.key!=='ArrowUp')return;
  ev.preventDefault(); const it=[...l.children], i=it.indexOf(document.activeElement);
  it[Math.max(0,Math.min(it.length-1,i+(ev.key==='ArrowDown'?1:-1)))].focus();
});
$('#test-card').addEventListener('submit',ev=>ev.preventDefault());
$('#test-card').addEventListener('input',ev=>{const t=ev.target; if(t.id==='t-name')st.name=t.value; else if(t.id==='t-email')st.email=t.value; else if(t.id==='t-pais')st.country=t.value});
itest(false);

/* Fondo del test: filas de retratos de líderes y logos de partidos, del mismo conjunto de datos */
(()=>{
  const first=['María Corina Machado','Lula da Silva','Andrés Manuel López Obrador','Nayib Bukele','Javier Milei','Michelle Bachelet','Gustavo Petro','José Mujica','Claudia Sheinbaum','Gabriel Boric','Hugo Chávez','Álvaro Uribe'];
  const L=T.L.filter(l=>l.i), top=first.map(n=>L.find(l=>l.n===n)).filter(Boolean), rest=L.filter(l=>!top.includes(l)), P=T.P.filter(q=>q.i);
  const pool=[...top,...rest], rows=[[],[],[]];
  pool.slice(0,42).forEach((l,i)=>rows[i%3].push(`<img src="img/test/${l.i}" alt="">`));
  P.slice(0,18).forEach((q,i)=>rows[i%3].splice(2+i%3*2+Math.floor(i/3)*3,0,`<img class="lg" src="img/test/${q.i}" alt="">`));
  $('#wall').innerHTML=rows.map((r,k)=>`<div class="wr w${k}"><div class="mq-t">${r.join('')}${r.join('')}</div></div>`).join('');
})();

/* Red: tarjetas que pasan. Personas, textos y grupos son ejemplos. */
const POSTS=[
 ['img/p3.jpg','Lucía P.','Activista urbana · Medellín','Estoy trabajando en un proyecto para aumentar los árboles en la ciudad. ¿Quién me ayuda?','Más árboles en la ciudad'],
 ['img/p1.jpg','Andrés V.','Consultor político · Monterrey','Armo equipo para una campaña de bajo presupuesto. Me falta alguien de datos y alguien de video.','Campañas de bajo presupuesto'],
 ['img/p4.jpg','Sofía M.','Candidata a concejala · Lima','Subí mi narrativa de 90 segundos. Destrócenla con cariño antes de que la use en público.','Narrativa y discurso'],
 ['img/p2.jpg','Mateo R.','Asesor legislativo · Santo Domingo','Publiqué un informe sobre alumbrado público y seguridad. Busco pares que lo revisen antes de llevarlo a medios.','Seguridad barrial'],
 ['JT','Julia T.','Concejala · Rosario','¿Partido o ruta independiente? Abro debate con quienes ya tomaron la decisión.','Fase 2'],
 ['RC','Rafa C.','Líder comunitario · Quetzaltenango','Este sábado hago mi primera reunión de escucha con doce vecinos. Comparto mi guía de preguntas.','Transparencia municipal']
];
const GROUPS=[['🙋‍♀️','Aumento de la participación femenina'],['💰','Reducción de impuestos locales'],['🌳','Más árboles en la ciudad'],['🔍','Transparencia municipal'],['🛡️','Seguridad barrial'],['🌾','Juventudes rurales'],['🚌','Transporte público digno'],['📣','Campañas de bajo presupuesto'],['💼','Empleo joven'],['💧','Agua y saneamiento']];
const av=a=>a.includes('/')?`<img class="av" src="${a}" alt="">`:`<span class="av a1">${a}</span>`;
const twice=h=>`<div class="mq-t">${h}${h.replace(/<article|<span(?= class="g )/g,m=>m+' aria-hidden="true"').replace(/<button/g,'<button tabindex="-1"')}</div>`;
$('#mq-posts').innerHTML=twice(POSTS.map((p,i)=>`<article class="pc r${i%3}"><header>${av(p[0])}<div><strong>${p[1]}</strong><small>${p[2]}</small></div></header><p>${p[3]}</p><footer><span class="tagc">${p[4]}</span><button>Me sumo</button></footer></article>`).join(''));
$('#mq-groups').innerHTML=twice(GROUPS.map((g,i)=>`<span class="g g${i%4}"><i>${g[0]}</i>${g[1]}</span>`).join(''));
document.addEventListener('click',e=>{const b=e.target.closest('.pc button');if(b){b.classList.toggle('in');b.textContent=b.classList.contains('in')?'Te sumaste':'Me sumo'}});

/* Videos de fondo: sin sonido, se reproducen solos; si el navegador lo impide queda el póster */
$$('.vbg video').forEach(v=>{v.muted=true;const go=()=>{const q=v.play();if(q)q.catch(()=>{})};go();document.addEventListener('click',go,{once:true})});

/* Marca en el menú la idea que se está viendo */
const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting)$$('.ideas button').forEach(b=>b.classList.toggle('on',b.dataset.scroll===x.target.id))}),{rootMargin:'-45% 0px -45% 0px'});
$$('.sp').forEach(x=>io.observe(x));
show();
