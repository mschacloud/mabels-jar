/* Mabel's Jar: sourdough starter journal. Data lives in the signed-in person's own Supabase rows (row level security). */
(function(){
"use strict";
const H = 36e5;
const LEVELS = [
  {k:"below", label:"Below the tie", sub:"sank", pct:-10},
  {k:"at", label:"At the tie", sub:"no rise", pct:0},
  {k:"q", label:"A little up", sub:"~25%", pct:25},
  {k:"half", label:"Half way", sub:"~50%", pct:50},
  {k:"well", label:"Well above", sub:"~75%", pct:75},
  {k:"double", label:"Doubled", sub:"2×", pct:100},
  {k:"more", label:"Past double", sub:"2.5×+", pct:150}
];
const LV = Object.fromEntries(LEVELS.map(l=>[l.k,l]));
const SMELLS = ["yeasty","yogurt","sour / tangy","vinegar","acetone","fruity / beery","cheesy","funky / vomit","just flour"];
const BUBBLES = ["none","a few","some","lots","throughout"];
const TOPS = ["flat","domed","frothy","sunk / cracked"];
const FLOURS = [{k:"ap",label:"All-purpose"},{k:"ww",label:"Whole wheat"},{k:"gf",label:"GF bread flour"}];

const S = {entries:[], meta:null, starter:null, user:null, tab:"today", canWrite:true, loaded:false, stale:false, err:null};

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtT = ms => new Date(ms).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
const fmtD = ms => new Date(ms).toLocaleDateString([], {weekday:"short", month:"short", day:"numeric"});
const dayKey = ms => { const d=new Date(ms); return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate(); };
const hrs = h => { if(h<1) return Math.round(h*60)+" min"; const r=Math.round(h*2)/2; return (r%1? r.toFixed(1) : r)+" h"; };
const ago = ms => { const h=(Date.now()-ms)/H; if(h<0) return "in "+hrs(-h); if(h<1) return Math.max(1,Math.round(h*60))+" min ago"; if(h<36) return hrs(h)+" ago"; return Math.round(h/24)+" days ago"; };
const toLocalInput = ms => { const d=new Date(ms); const p=n=>String(n).padStart(2,"0"); return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); };
const fromLocalInput = v => new Date(v).getTime();
const median = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); const m=s.length>>1; return s.length%2? s[m] : (s[m-1]+s[m])/2; };
const photoSrc = p => p.url || p.turl || "";
const thumbSrc = p => p.turl || p.url || "";
const flourTotal = e => (e.ap||0)+(e.ww||0)+(e.gf||0);
const ratioStr = e => { const s=e.starter||0; if(!s) return ""; const f=v=>{const r=Math.round(v/s*10)/10; return (r%1? r.toFixed(1): String(r));}; return "1 : "+f(flourTotal(e))+" : "+f(e.water||0); };
function toast(msg){ const t=document.createElement("div"); t.className="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }

/* jar drawing: pct above the hair tie */
function jarSVG(pct, opts={}){
  const w=opts.w||80, h=opts.h||110, fell=opts.fell, peakPct=opts.peak;
  const top=14, bottom=h-6, inner=bottom-top;
  const base=inner*0.36;                 // level right after feeding = hair tie
  const lvl = p => bottom - Math.min(inner-2, Math.max(4, base*(1+p/100)));
  const y = lvl(pct==null?0:pct), tie = lvl(0);
  const streak = (fell && peakPct!=null && peakPct>pct) ? `<path d="M10 ${lvl(peakPct)} q8 6 14 0 t14 0 t14 0 t14 0" fill="none" stroke="var(--dough)" stroke-width="3" stroke-linecap="round" opacity=".8"/>` : "";
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <rect x="12" y="2" width="${w-24}" height="9" rx="2" fill="var(--wheat)"/>
    <path d="M8 ${top} h${w-16} v${inner-6} a6 6 0 0 1 -6 6 h${-(w-28)} a6 6 0 0 1 -6 -6z" fill="var(--paper)" stroke="var(--glass)" stroke-width="2.5"/>
    ${streak}
    <path d="M9.5 ${y} h${w-19} V${bottom-6} a5 5 0 0 1 -5 5 h${-(w-29)} a5 5 0 0 1 -5 -5z" fill="var(--dough)"/>
    <g fill="var(--paper)" opacity=".75"><circle cx="${w*.3}" cy="${(y+bottom)/2}" r="2.2"/><circle cx="${w*.62}" cy="${(y+bottom)/2+8}" r="1.6"/><circle cx="${w*.48}" cy="${bottom-12}" r="2.6"/><circle cx="${w*.7}" cy="${y+8}" r="1.4"/></g>
    <rect x="5" y="${tie-2.5}" width="${w-10}" height="5" rx="2.5" fill="var(--olive)"/>
  </svg>`;
}

/* ---------- coach maths ---------- */
function computeCycles(){
  const E = S.entries;
  const feeds = E.filter(e=>e.type==="feed").sort((a,b)=>a.at-b.at);
  return feeds.map((f,i)=>{
    const end = feeds[i+1] ? feeds[i+1].at : Infinity;
    const checks = E.filter(c=>c.type==="check" && c.at>f.at && c.at<=end).sort((a,b)=>a.at-b.at)
      .map(c=>({...c, h:(c.at-f.at)/H, pct:(LV[c.level]||{pct:0}).pct}));
    let max=null; checks.forEach(c=>{ if(!max || c.pct>max.pct) max=c; });
    const fellAfter = max ? checks.some(c=>c.at>max.at && (c.fell || c.pct<max.pct)) : false;
    const dbl = checks.find(c=>c.pct>=100);
    let status="unknown";
    if(dbl && dbl.h<=8.5) status="pass";
    else if(checks.some(c=>c.h>=7.5 && c.h<=12 && c.pct<100) && !(dbl && dbl.h<7.5)) status="miss";
    const ongoing = !feeds[i+1];
    const rf = flourTotal(f)/(f.starter||1);
    return {feed:f, checks, max, fellAfter, dbl, status, ongoing, rf, ageH:(Math.min(end,Date.now())-f.at)/H};
  });
}
// shift a time to its 1:2:2-equivalent (bigger feeds take longer)
const norm = (h, rf) => h - 1.7*Math.log2(Math.max(.5,rf)/2);

function coach(){
  const cyc = computeCycles();
  const out = {cyc, status:"building", streak:0, tips:[], kitchen:null, peak:null, next:null};
  if(!cyc.length) return out;
  // readiness streak, newest first, skipping an in-progress cycle that can't be judged yet
  const rev=[...cyc].reverse();
  let i=0; if(rev[0] && rev[0].ongoing && rev[0].status==="unknown") i=1;
  for(; i<rev.length; i++){ if(rev[i].status==="pass") out.streak++; else break; }
  out.status = out.streak>=3 ? "ready" : out.streak>=1 ? "close" : "building";

  // learned peak: cycles that clearly rose
  const peaks = cyc.filter(c=>c.max && c.max.pct>=50 && c.fellAfter && c.checks.some(k=>k.h<c.max.h && k.pct<c.max.pct)).map(c=>({h:c.max.h, n:norm(c.max.h,c.rf), c}));
  const dbls = cyc.filter(c=>c.dbl).map(c=>({h:c.dbl.h, n:norm(c.dbl.h,c.rf)}));
  const recentP = peaks.slice(-5), recentD = dbls.slice(-5);
  if(recentP.length) out.peak = {h:median(recentP.map(p=>p.h)), n:recentP.length};
  const nd = recentD.length ? median(recentD.map(d=>d.n)) : null;
  if(nd!=null){
    out.kitchen = nd<4.5 ? {label:"Warm", range:"likely 76°F or warmer"}
      : nd<7 ? {label:"Comfortable", range:"about 72–76°F"}
      : nd<10 ? {label:"Cool", range:"about 68–72°F"}
      : {label:"Chilly", range:"likely under 68°F, or Mabel is still gaining strength"};
    out.kitchen.basis = `based on ${recentD.length} rise${recentD.length>1?"s":""} that reached double`;
  }

  // what to do next
  const last = cyc[cyc.length-1], lf = last.feed, now=Date.now();
  const sinceFeed = (now-lf.at)/H;
  const usual = S.meta && S.meta.feedTime || "17:00";
  const checkTimes = [4,6,8].map(h=>({h, at:lf.at+h*H}))
    .filter(t=>t.at>now-20*60e3 && !last.checks.some(c=>Math.abs(c.at-t.at)<45*60e3));
  if(sinceFeed>=24) out.next = {kind:"feed", text:`Feeding is due. She was last fed ${ago(lf.at)}.`};
  else if(checkTimes.length) out.next = {kind:"check", times:checkTimes};
  else {
    const [hh,mm]=usual.split(":").map(Number); const d=new Date(now); d.setHours(hh,mm,0,0); if(d.getTime()<now+H) d.setDate(d.getDate()+1);
    out.next = {kind:"feed", text:`Next feed around ${fmtT(d.getTime())} ${dayKey(d.getTime())===dayKey(now)?"today":"tomorrow"}.`};
  }

  // tips
  const recentChecks = S.entries.filter(e=>e.type==="check" && now-e.at<72*H);
  const judged = cyc.filter(c=>c.status!=="unknown");
  const unknownRecent = cyc.slice(-4).filter(c=>c.status==="unknown").length;
  if(out.status==="ready") out.tips.push("She has doubled within 8 hours "+out.streak+" feeds in a row. Plan your dough for when she's near her peak, about "+(out.peak?hrs(out.peak.h):"4–8 h")+" after a feed.");
  if(unknownRecent>=2) out.tips.push("Most recent checks were 12+ hours after feeding, so her peak happened while nobody was looking. Check at 4, 6 and 8 hours after a feed for a couple of days; that's all the coach needs.");
  if(recentChecks.some(c=>(c.smells||[]).includes("acetone"))) out.tips.push("The acetone smell means she ran out of food and is hungry. It's common in week two and fades as she matures. Keep feeding on time. If it lasts once she's doubling reliably, try 1:3:3.");
  if(recentChecks.some(c=>c.liquid)) out.tips.push("Liquid on top (hooch) is another hunger sign. Stir it in or pour it off before feeding; pouring it off gives a milder starter.");
  const fast = cyc.slice(-4).filter(c=>c.dbl && c.dbl.h<3.5).length;
  if(fast>=2) out.tips.push("She's doubling in under 3½ hours, so she peaks and crashes early. Try 1:3:3 or cooler water to stretch her rise into the 4–8 h window.");
  const misses = cyc.slice(-4).filter(c=>c.status==="miss").length;
  if(misses>=2) out.tips.push("She isn't doubling by 8 hours yet. A warmer spot helps: on top of the fridge, or in the oven with only the light on and the door cracked (check it doesn't get hot). Water that feels just warm on your wrist helps too.");
  if(!out.kitchen && judged.length===0) out.tips.push("No thermometer needed. Once she's checked a few times in the 4–8 hour window, the coach reads how warm your kitchen runs from how fast she rises.");
  return out;
}

/* ---------- rendering ---------- */
function render(){
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-current", b.dataset.tab===S.tab?"page":"false"));
  const born = S.meta && S.meta.born ? S.meta.born : new Date(2026,10,5,16,45).getTime();
  const day = Math.floor((new Date().setHours(0,0,0,0) - new Date(born).setHours(0,0,0,0))/864e5)+1;
  $("header.top h1").textContent = (S.meta && S.meta.name) || "Mabel";
  $("#age").textContent = "Day "+day+" · born "+new Date(born).toLocaleDateString([], {month:"short", day:"numeric", year:"numeric"});
  const bn = $("#banner");
  if(S.err){ bn.hidden=false; bn.textContent=S.err; }
  else if(S.stale){ bn.hidden=false; bn.textContent="Can't reach Mabel's saved journal yet. What you see may be out of date."; }
  else bn.hidden=true;
  const v = $("#view");
  if(S.tab==="today") v.innerHTML = renderToday();
  else if(S.tab==="journal") v.innerHTML = renderJournal();
  else if(S.tab==="ask") v.innerHTML = renderAsk();
  else v.innerHTML = renderBake();
}

function renderToday(){
  if(!S.loaded && !S.entries.length) return `<div class="card empty">Opening Mabel's journal… Your feeds, rise checks and photos will show here.</div>`;
  if(S.loaded && !S.starter && !S.err) return `<section class="card" style="max-width:560px"><h2>Welcome</h2>
    <p>Set up your starter to begin, or bring over a history file if you have one.</p>
    <div class="stack"><button type="button" class="btn primary" data-startersetup>Set up my starter</button>
    <button type="button" class="btn" data-openmenu>Import a history file</button></div></section>`;
  const C = coach(); const cyc=C.cyc; const last=cyc[cyc.length-1];
  let jar, big, since;
  if(!last){ jar=jarSVG(0); big="No feeds logged yet"; since="Tap “Fed her” after her next feed."; }
  else{
    const lc = last.checks[last.checks.length-1];
    const peak = last.max ? last.max.pct : null;
    if(lc){ const L=LV[lc.level]||LEVELS[1]; jar=jarSVG(L.pct,{fell:lc.fell||last.fellAfter, peak}); big=L.label+(lc.fell?", fallen back":""); since=`Checked ${ago(lc.at)}, ${hrs(lc.h)} after her ${fmtT(last.feed.at)} feed.`; }
    else { jar=jarSVG(0); big="Fed "+ago(last.feed.at); since=`${ratioStr(last.feed)} at ${fmtT(last.feed.at)}. Hair tie marks her starting level.`; }
  }
  const pillCls = C.status==="ready"?"ready":C.status==="close"?"close":"";
  const pillTxt = C.status==="ready"?"Ready to bake":C.status==="close"?`Getting close · ${C.streak} of 3`:"Building strength";
  const dots = cyc.slice(-7).map(c=>{
    const cls = c.ongoing && c.status==="unknown" ? "now" : c.status;
    const ttl = c.status==="pass"?`Doubled at ${hrs(c.dbl.h)}`:c.status==="miss"?"Not doubled by 8 h":c.ongoing?"In progress":"Not checked in the 4–8 h window";
    return `<div class="dot ${cls}" title="${esc(ttl)}"><i></i>${esc(new Date(c.feed.at).toLocaleDateString([], {month:"numeric", day:"numeric"}))}</div>`;
  }).join("");
  let next="";
  if(C.next){
    if(C.next.kind==="check") next=`<div class="next"><b>Rise checks for this feed:</b> ${C.next.times.map(t=>`<span class="num">${fmtT(t.at)}</span> <span class="muted">(${t.h} h)</span>`).join(" · ")}. Note where she is against the hair tie.</div>`;
    else next=`<div class="next">${esc(C.next.text)}</div>`;
  }
  const facts = `<dl class="facts">
    <dt>Peaks around</dt><dd>${C.peak? `${hrs(C.peak.h)} after a feed <span class="muted">(from ${C.peak.n} rise${C.peak.n>1?"s":""})</span>` : `<span class="muted">Not seen yet</span>`}</dd>
    <dt>Kitchen reads</dt><dd>${C.kitchen? `${esc(C.kitchen.label)}, ${esc(C.kitchen.range)} <span class="muted">(${esc(C.kitchen.basis)})</span>` : `<span class="muted">Needs a few 4–8 h checks</span>`}</dd>
    <dt>Usual feed</dt><dd>${last? esc(ratioStr(last.feed))+" · "+esc(flourMix(last.feed)) : "—"}</dd>
  </dl>`;
  return `<div class="grid today">
    <section class="card a-now" aria-labelledby="nowh">
      <div class="eyebrow" id="nowh">Right now</div>
      <div class="jarrow" style="margin-top:8px">${jar}<div class="txt"><div class="big">${esc(big)}</div><div class="since">${esc(since)}</div></div></div>
      ${S.canWrite? `<div class="actions">
        <button class="act primary" data-act="feed">${ICON.feed}Fed her</button>
        <button class="act" data-act="check">${ICON.check}Rise check</button>
        <button class="act" data-act="note">${ICON.cam}Photo / note</button>
      </div>`:""}
    </section>
    <section class="card a-coach" aria-labelledby="coachh">
      <div class="coachhead"><h2 id="coachh">Coach</h2><span class="pill ${pillCls}">${pillTxt}</span></div>
      <div class="muted" style="font-size:14px">She's ready to bake once she doubles within 4–8 hours of a feed, three feeds in a row.</div>
      <div class="streak" aria-label="Last feeds">${dots}</div>
      <div class="legend"><span><i style="background:var(--good)"></i>doubled by 8 h</span><span><i style="background:var(--bad)"></i>didn't</span><span><i style="background:var(--muted);opacity:.5"></i>not checked in time</span></div>
      ${next}
      ${facts}
      ${C.tips.length? `<ul class="tips">${C.tips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul>`:""}
    </section>
    ${lookCard()}
    <section class="card a-curve" aria-labelledby="curveh">
      <h2 id="curveh">Rise after each feed</h2>
      <div class="muted" style="font-size:14px">Each line is one feed. The shaded band is the 4–8 hour window she needs to double in.</div>
      <div class="chartbox">${chartSVG(cyc.slice(-6))}</div>
    </section>
  </div>`;
}
function lookCard(){
  const latest=[...S.entries].filter(e=>e.photos&&e.photos.length).sort((a,b)=>b.at-a.at)[0];
  const when = e => esc(new Date(e.at).toLocaleDateString([], {month:"short",day:"numeric"}))+(e.timeKnown===false?"":" · "+esc(fmtT(e.at)));
  const shot = latest
    ? `<button type="button" class="shot" data-photo="${esc(latest.id)}:0" aria-label="Enlarge latest photo"><img src="${esc(photoSrc(latest.photos[0]))}" alt="Mabel's latest photo" loading="lazy"></button><div class="shotcap num">${when(latest)}. More photos in the Journal.</div>`
    : `<p class="muted" style="margin:0">Add a photo with a rise check and her latest one shows here.</p>`;
  const recent=[...S.entries].sort((a,b)=>b.at-a.at).slice(0,4).map(e=>`<li><span class="t num">${when(e)}</span><span class="w">${esc(describe(e).what)}</span></li>`).join("");
  return `<section class="card a-look" aria-labelledby="lookh"><h2 id="lookh">Latest photo</h2>${shot}${recent?`<ul class="recent" aria-label="Latest entries">${recent}</ul>`:""}</section>`;
}
function flourMix(f){ const parts=FLOURS.filter(x=>f[x.k]).map(x=>x.label.toLowerCase()); if(parts.length<2) return parts[0]||""; const t=flourTotal(f); return FLOURS.filter(x=>f[x.k]).map(x=>Math.round(f[x.k]/t*100)+"% "+x.label.toLowerCase()).join(", "); }

function chartSVG(cyc){
  const W=Math.round(Math.max(320, Math.min(900, (document.querySelector('#view')||document.body).clientWidth-34))), Hh=W<500?230:270, L=44, R=14, T=14, B=34, maxH=24, minP=-10, maxP=150;
  const x=h=>L+(Math.min(h,maxH)/maxH)*(W-L-R), y=p=>T+(1-(p-minP)/(maxP-minP))*(Hh-T-B);
  let g=`<rect x="${x(4)}" y="${T}" width="${x(8)-x(4)}" height="${Hh-T-B}" fill="var(--olive-soft)"/>`;
  [0,50,100,150].forEach(p=>{ g+=`<line x1="${L}" x2="${W-R}" y1="${y(p)}" y2="${y(p)}" stroke="var(--line)" stroke-width="1" ${p===100?'stroke-dasharray="5 4" stroke="var(--wheat)" stroke-width="1.5"':""}/><text x="${L-6}" y="${y(p)+4}" text-anchor="end" font-size="12" fill="var(--muted)">${p===0?"tie":p===100?"2×":"+"+p+"%"}</text>`; });
  [0,4,8,12,16,20,24].forEach(h=>{ g+=`<text x="${x(h)}" y="${Hh-B+18}" text-anchor="middle" font-size="12" fill="var(--muted)">${h}h</text>`; });
  g+=`<text x="${x(6)}" y="${T+14}" text-anchor="middle" font-size="11" fill="var(--olive)" font-weight="600">4–8 h</text>`;
  const withChecks = cyc.filter(c=>c.checks.length);
  withChecks.forEach((c,i)=>{
    const newest = i===withChecks.length-1;
    const col = newest? "var(--olive)" : "var(--wheat)";
    const op = newest? 1 : .35+.5*(i/Math.max(1,withChecks.length-1));
    const pts=[[0,0],...c.checks.filter(k=>k.h<=maxH).map(k=>[k.h,k.pct])];
    g+=`<polyline points="${pts.map(p=>x(p[0])+","+y(p[1])).join(" ")}" fill="none" stroke="${col}" stroke-width="${newest?3:2}" stroke-linejoin="round" opacity="${op}"/>`;
    pts.slice(1).forEach(p=>{ g+=`<circle cx="${x(p[0])}" cy="${y(p[1])}" r="${newest?4.5:3.5}" fill="${col}" opacity="${op}"/>`; });
    if(newest){ const lp=pts[pts.length-1]; g+=`<text x="${Math.min(x(lp[0])+8,W-R-60)}" y="${y(lp[1])-8}" font-size="12" fill="var(--olive)" font-weight="600">${esc(fmtD(c.feed.at))}</text>`; }
  });
  if(!withChecks.length) g+=`<text x="${(L+W-R)/2}" y="${Hh/2}" text-anchor="middle" font-size="14" fill="var(--muted)">Log a rise check after a feed to start her curve</text>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Rise above the hair tie by hours since feeding">${g}</svg>`;
}

function describe(e){
  if(e.type==="feed"){
    const fl = FLOURS.filter(x=>e[x.k]).map(x=>`${e[x.k]} g ${x.label.toLowerCase()}`).join(" + ");
    return {what:"Fed "+ratioStr(e), detail:`${e.starter} g starter + ${fl} + ${e.water} g water`};
  }
  if(e.type==="check"){ const L=LV[e.level]||LEVELS[1]; return {what:"Rise check · "+L.label+(e.fell?", fallen back":""), detail:[e.bubbles&&e.bubbles!=="none"?`${e.bubbles} bubbles`:e.bubbles==="none"?"no bubbles":"", e.top||"", e.liquid?"liquid on top":""].filter(Boolean).join(" · ")}; }
  return {what:"Note", detail:""};
}

function renderJournal(){
  if(!S.loaded && !S.entries.length) return `<div class="card empty">Opening Mabel's journal…</div>`;
  if(!S.entries.length) return `<div class="card empty">Nothing logged yet. Use “Fed her” on the Today tab after her next feed.</div>`;
  const conf = (S.meta && S.meta.toConfirm || []);
  let html = conf.length ? `<div class="confirm"><b>Still to confirm</b><ul>${conf.map((q,i)=>`<li>${esc(q)} ${S.canWrite?`<button class="linkbtn" data-unconfirm="${i}">Done</button>`:""}</li>`).join("")}</ul></div>` : "";
  const sorted=[...S.entries].sort((a,b)=>b.at-a.at);
  const days={}; const order=[];
  sorted.forEach(e=>{ const k=dayKey(e.at); if(!days[k]){days[k]=[];order.push(k);} days[k].push(e); });
  const born = S.meta && S.meta.born ? S.meta.born : sorted[sorted.length-1].at;
  order.forEach(k=>{
    const list=days[k]; const d0=list[0].at;
    const dn = Math.floor((new Date(d0).setHours(0,0,0,0)-new Date(born).setHours(0,0,0,0))/864e5)+1;
    html += `<section class="day"><div class="dayhead"><h3>${esc(fmtD(d0))}</h3><span class="muted num">Day ${dn}</span></div>`;
    list.forEach(e=>{
      const D=describe(e);
      html += `<button class="entry" data-edit="${esc(e.id)}">
        <span class="ic ${e.type==="check"?"check":""}">${e.type==="feed"?ICON.feed:e.type==="check"?ICON.check:ICON.cam}</span>
        <span class="body">
          <span class="line1"><span class="what">${esc(D.what)}</span><span class="time num">${e.timeKnown===false?"time not noted":fmtT(e.at)}</span>${e.estimate?`<span class="tag">estimate</span>`:""}</span>
          ${D.detail?`<span class="detail" style="display:block">${esc(D.detail)}</span>`:""}
          ${(e.smells&&e.smells.length)?`<span class="chips">${e.smells.map(s=>`<span class="chip">${esc(s)}</span>`).join("")}</span>`:""}
          ${e.note?`<span class="note" style="display:block">${esc(e.note)}</span>`:""}
          ${(e.photos&&e.photos.length)?`<span class="thumbs">${e.photos.map((p,i)=>`<img loading="lazy" src="${esc(thumbSrc(p))}" alt="Mabel, ${esc(fmtD(e.at))}" data-photo="${esc(e.id)}:${i}">`).join("")}</span>`:""}
        </span></button>`;
    });
    html += `</section>`;
  });
  return html;
}

function renderBake(){
  return `<div class="card" style="margin-bottom:16px"><h2>Baking comes next</h2>
    <p class="muted" style="margin:6px 0 0">Once the coach says Mabel is ready, this is where loaves will live. Plan: learn on wheat loaves first, then move Mabel onto gluten-free bread flour for lower-gluten bread. The feed form already has a GF bread flour field for that switch.</p></div>
    <div class="later">
      <div class="card"><h3>Recipes</h3><p class="muted" style="margin:0">Proven recipes with the times and temperatures that worked for you.</p></div>
      <div class="card"><h3>Bake log</h3><p class="muted" style="margin:0">Each loaf with crumb photos, bake times and what you'd change.</p></div>
      <div class="card"><h3>Shopping list</h3><p class="muted" style="margin:0">Flour, banneton, Dutch oven and the rest, by what you need at each stage.</p></div>
    </div>`;
}

const ICON = {
  feed:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 10h16l-1.5 9a2 2 0 0 1-2 1.7h-9a2 2 0 0 1-2-1.7z"/><path d="M8 10c0-3 1.5-6 4-6s4 3 4 6M12 13v4M9.5 15h5"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 3h10M8 3v4c-2 1-3 2.5-3 4.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7.5C19 9.5 18 8 16 7V3"/><path d="M3.5 14h17"/><path d="M12 11V6m-2 2 2-2 2 2"/></svg>`,
  cam:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`
};

/* ---------- forms ---------- */
let F = null; // form state
function openForm(type, entry){
  const lastFeed = [...S.entries].filter(e=>e.type==="feed").sort((a,b)=>b.at-a.at)[0];
  const base = entry ? JSON.parse(JSON.stringify(entry)) : {type, at:Date.now(), photos:[], smells:[]};
  if(!entry && type==="feed"){ const t=lastFeed||{starter:50,ap:50,ww:50,water:100}; Object.assign(base,{starter:t.starter||50, ap:t.ap||0, ww:t.ww||0, gf:t.gf||0, water:t.water||100}); }
  if(!entry && type==="check"){ base.level=null; base.fell=false; base.liquid=false; }
  F = {entry:base, original:entry||null, editing:!!entry, uploading:0, err:"", confirmDel:false, added:[], removed:[], saving:false};
  drawSheet();
}
function closeSheet(){ if(F && F.added.length && sb) sb.storage.from(BUCKET).remove(F.added).catch(()=>{}); F=null; $("#layer").innerHTML=""; render(); }
function stepper(k,label){ return `<div class="gram"><div class="gl">${label}</div><div class="gr"><button type="button" data-step="${k}:-5" aria-label="Less ${label}">−</button><input id="g-${k}" inputmode="numeric" pattern="[0-9]*" value="${F.entry[k]||0}" data-gram="${k}" aria-label="${label} grams"><button type="button" data-step="${k}:5" aria-label="More ${label}">+</button></div></div>`; }
function drawSheet(){
  const e=F.entry; const t=e.type;
  const title = (F.editing?"Edit ":"")+(t==="feed"?"feed":t==="check"?"rise check":"photo or note");
  let body = (F.editing||F.showTime)
    ? `<div class="field"><label for="f-at">When</label><input type="datetime-local" id="f-at" value="${toLocalInput(e.at)}"></div>`
    : `<div class="field nowrow"><span><b>Now</b> · <span class="num">${fmtT(Date.now())}</span></span><button type="button" class="linkbtn" data-showtime>Different time?</button></div>`;
  if(t==="feed"){
    body += `<div class="field"><div class="lab">Grams${F.editing?"":` <span style="font-weight:500">· same as her last feed, tap ± to change</span>`}</div><div class="grams">${stepper("starter","Starter kept")}${stepper("water","Water")}${stepper("ap","All-purpose")}${stepper("ww","Whole wheat")}${stepper("gf","GF bread flour")}</div><div class="ratio" id="ratio">Ratio <b class="num">${esc(ratioStr(e))}</b> · ${flourTotal(e)+(e.starter||0)+(e.water||0)} g in the jar</div></div>
    <div class="field muted" style="font-size:14px">Slide the hair tie to the new level after mixing.</div>`;
  }
  if(t==="check"){
    body += `<div class="field"><div class="lab">Where is she against the hair tie?</div><div class="levels">${LEVELS.map(l=>`<button type="button" class="lvl" data-level="${l.k}" aria-pressed="${e.level===l.k}">${jarSVG(l.pct,{w:34,h:46})}<span>${l.label}</span><small>${l.sub}</small></button>`).join("")}</div></div>
    <label class="toggle"><input type="checkbox" id="f-fell" ${e.fell?"checked":""}> Rose and fell back (streaks above her)</label>
    <label class="toggle"><input type="checkbox" id="f-liquid" ${e.liquid?"checked":""}> Liquid on top</label>
    <div class="field"><div class="lab">Bubbles</div><div class="opts">${BUBBLES.map(b=>`<button type="button" class="opt" data-bub="${b}" aria-pressed="${e.bubbles===b}">${b}</button>`).join("")}</div></div>
    <div class="field"><div class="lab">Top</div><div class="opts">${TOPS.map(b=>`<button type="button" class="opt" data-top="${b}" aria-pressed="${e.top===b}">${b}</button>`).join("")}</div></div>
    <div class="field"><div class="lab">Smell</div><div class="opts">${SMELLS.map(s=>`<button type="button" class="opt" data-smell="${s}" aria-pressed="${(e.smells||[]).includes(s)}">${s}</button>`).join("")}</div></div>`;
  }
  if(t!=="check" && t!=="feed"){
    body += `<div class="field"><div class="lab">Smell</div><div class="opts">${SMELLS.map(s=>`<button type="button" class="opt" data-smell="${s}" aria-pressed="${(e.smells||[]).includes(s)}">${s}</button>`).join("")}</div></div>`;
  }
  body += `<div class="field"><div class="lab">Photos</div><div class="photos">${(e.photos||[]).map((p,i)=>`<span class="ph"><img src="${esc(thumbSrc(p))}" alt=""><button type="button" class="x" data-rmph="${i}" aria-label="Remove photo">×</button></span>`).join("")}
    ${S.user? `<label class="addph">${F.uploading?"Saving…":"+ Add<br>photo"}<input type="file" id="f-photo" accept="image/*" multiple></label>` : `<span class="muted" style="font-size:13px">Photos can be added by the journal's owner.</span>`}</div></div>
    <div class="field"><label for="f-note">Notes</label><textarea id="f-note" placeholder="${t==="feed"?"Water temp, where she's sitting…":"What you notice"}">${esc(e.note||"")}</textarea></div>
    ${F.err?`<div class="err">${esc(F.err)}</div>`:""}
    <div class="sheetbtns">
      ${F.editing? (F.confirmDel? `<button type="button" class="btn danger" data-del="yes">Yes, delete it</button>` : `<button type="button" class="btn danger" data-del="ask">Delete</button>`) : `<span></span>`}
      <div style="display:flex;gap:10px"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-save ${F.uploading||F.saving?"disabled":""}>${F.saving?"Saving…":"Save"}</button></div>
    </div>`;
  $("#layer").innerHTML = `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title[0].toUpperCase()+title.slice(1))}</h2>${body}</div></div>`;
}
function syncForm(){
  if(!F) return; const e=F.entry;
  const at=$("#f-at"); if(at && at.value){ const v=fromLocalInput(at.value); if(!isNaN(v)){ if(v!==e.at) e.timeKnown=true; e.at=v; } }
  const n=$("#f-note"); if(n) e.note=n.value.trim();
  ["fell","liquid"].forEach(k=>{ const c=$("#f-"+k); if(c) e[k]=c.checked; });
  document.querySelectorAll("[data-gram]").forEach(i=>{ e[i.dataset.gram]=Math.max(0,parseInt(i.value,10)||0); });
}

/* ---------- Supabase data layer ---------- */
const CFG = window.MABEL_CONFIG || {};
let sb = null;
const urlCache = {}; let urlCacheAt = 0;
const BUCKET = "photos";

function rowToEntry(r){
  return {id:r.id, type:r.type, at:Date.parse(r.at), timeKnown:r.time_known, estimate:r.estimate,
    starter:r.starter, ap:r.ap, ww:r.ww, gf:r.gf, water:r.water,
    level:r.level, fell:r.fell, liquid:r.liquid, bubbles:r.bubbles, top:r.top,
    smells:r.smells||[], note:r.note||"",
    photos:(r.photos||[]).map(p=>({path:p.path, thumb:p.thumb||null, url:urlCache[p.path]||"", turl:p.thumb?urlCache[p.thumb]||"":""}))};
}
function entryToRow(e){
  const isFeed=e.type==="feed", isCheck=e.type==="check";
  return {type:e.type, at:new Date(e.at).toISOString(), time_known:e.timeKnown!==false, estimate:!!e.estimate,
    starter:isFeed?(e.starter||0):null, ap:isFeed?(e.ap||0):null, ww:isFeed?(e.ww||0):null, gf:isFeed?(e.gf||0):null, water:isFeed?(e.water||0):null,
    level:isCheck?e.level:null, fell:isCheck?!!e.fell:null, liquid:isCheck?!!e.liquid:null, bubbles:isCheck?(e.bubbles||null):null, top:isCheck?(e.top||null):null,
    smells:e.smells||[], note:e.note||null,
    photos:(e.photos||[]).map(p=>({path:p.path, thumb:p.thumb||null})), updated_at:new Date().toISOString()};
}
async function signPaths(paths){
  if(Date.now()-urlCacheAt > 10*H){ for(const k in urlCache) delete urlCache[k]; urlCacheAt=Date.now(); }
  const need=[...new Set(paths.filter(p=>p && !urlCache[p]))];
  for(let i=0;i<need.length;i+=100){
    const {data, error} = await sb.storage.from(BUCKET).createSignedUrls(need.slice(i,i+100), 12*3600);
    if(error) throw error;
    (data||[]).forEach(d=>{ if(d.signedUrl) urlCache[d.path]=d.signedUrl; });
  }
}
async function loadAll(){
  try{
    const {data:st, error:e1} = await sb.from("starters").select("*").order("created_at").limit(1);
    if(e1) throw e1;
    S.starter = st[0] || null;
    if(!S.starter){ S.entries=[]; S.meta=null; S.loaded=true; S.err=null; if(!F) render(); return; }
    S.meta = {name:S.starter.name, born:S.starter.born?Date.parse(S.starter.born):null, feedTime:S.starter.feed_time||"17:00", toConfirm:S.starter.to_confirm||[]};
    const {data:rows, error} = await sb.from("entries").select("*").eq("starter_id", S.starter.id).order("at");
    if(error) throw error;
    const paths=[]; rows.forEach(r=>(r.photos||[]).forEach(p=>{ paths.push(p.path); if(p.thumb) paths.push(p.thumb); }));
    try{ await signPaths(paths); }catch(_){}
    S.entries = rows.map(rowToEntry); S.loaded=true; S.err=null; S.stale=false;
  }catch(err){
    S.loaded=true;
    S.err = navigator.onLine===false ? "You're offline. Mabel's journal will load when you're back online." : "Couldn't load Mabel's journal. Pull down or reopen the app to try again.";
  }
  if(!F) render();
}

/* ---------- saving ---------- */
async function save(){
  syncForm(); const e=F.entry;
  if(!F.editing && !F.showTime) e.at=Date.now();
  if(e.type==="check" && !e.level){ F.err="Pick where she is against the hair tie."; drawSheet(); return; }
  if(e.type==="feed" && (!e.starter || !flourTotal(e))){ F.err="Add grams for the starter and at least one flour."; drawSheet(); return; }
  if(e.type==="note" && !e.note && !(e.photos||[]).length){ F.err="Add a photo or a note."; drawSheet(); return; }
  if(F.editing && e.estimate && e.timeKnown) e.estimate=false;
  const row = entryToRow(e);
  F.saving=true; drawSheet();
  try{
    let res;
    if(F.editing) res = await sb.from("entries").update(row).eq("id", e.id);
    else res = await sb.from("entries").insert({...row, starter_id:S.starter.id});
    if(res.error) throw res.error;
    if(F.removed.length) sb.storage.from(BUCKET).remove(F.removed).catch(()=>{});
    const msg = e.type==="feed"?"Feed saved":e.type==="check"?"Rise check saved":"Saved";
    F.added=[]; closeSheet(); toast(msg); loadAll();
  }catch(err){ F.saving=false; F.err="Couldn't save. Check your connection and tap Save again."; drawSheet(); }
}
async function del(){
  try{
    const {error} = await sb.from("entries").delete().eq("id", F.entry.id);
    if(error) throw error;
    const paths=[]; (F.original.photos||[]).forEach(p=>{ paths.push(p.path); if(p.thumb) paths.push(p.thumb); });
    if(paths.length) sb.storage.from(BUCKET).remove(paths).catch(()=>{});
    F.added=[]; closeSheet(); toast("Deleted"); loadAll();
  }catch(err){ F.err="Couldn't delete. Try again."; drawSheet(); }
}
async function resize(file, max, q){
  const bmp = await createImageBitmap(file, {imageOrientation:"from-image"});
  const sc = Math.min(1, max/Math.max(bmp.width,bmp.height));
  const c=document.createElement("canvas"); c.width=Math.round(bmp.width*sc); c.height=Math.round(bmp.height*sc);
  c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
  return await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("encode")),"image/jpeg",q));
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2));
async function uploadPhoto(full, thumb, base){
  const uid=S.user.id; base=base||newId();
  const p=`${uid}/${base}.jpg`, t=`${uid}/${base}_t.jpg`;
  const a = await sb.storage.from(BUCKET).upload(p, full, {contentType:"image/jpeg", upsert:true});
  if(a.error) throw a.error;
  const b = await sb.storage.from(BUCKET).upload(t, thumb, {contentType:"image/jpeg", upsert:true});
  if(b.error) throw b.error;
  return {path:p, thumb:t};
}
async function addPhotos(files){
  syncForm();
  for(const f of files){
    F.uploading++; drawSheet();
    try{
      // Keep photos large (2048 px, plenty for zooming in on bubbles) plus a small thumbnail for the journal
      const full = await resize(f, 2048, .85), thumb = await resize(f, 480, .72);
      const ph = await uploadPhoto(full, thumb);
      ph.url = URL.createObjectURL(full); ph.turl = URL.createObjectURL(thumb);
      if(F){ F.entry.photos=[...(F.entry.photos||[]), ph]; F.added.push(ph.path, ph.thumb); F.err=""; }
    }catch(err){ if(F) F.err = "A photo didn't upload. Check your connection and try it again."; }
    if(F){ F.uploading--; drawSheet(); }
  }
}

function md(t){
  const lines = esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").split(/\n/);
  let out="", inList=false;
  lines.forEach(l=>{ const m=l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if(m){ if(!inList){out+="<ul>";inList=true;} out+="<li>"+m[1]+"</li>"; }
    else { if(inList){out+="</ul>";inList=false;} if(l.trim()) out+="<p>"+l.replace(/^#+\s*/,"")+"</p>"; } });
  if(inList) out+="</ul>"; return out;
}
function logText(){
  const cyc = computeCycles(); const hOf = {};
  cyc.forEach(c=>c.checks.forEach(k=>{ hOf[k.id]=k.h; }));
  return [...S.entries].sort((a,b)=>a.at-b.at).map(e=>{
    const when = fmtD(e.at)+" "+(e.timeKnown===false?"(time not noted)":fmtT(e.at))+(e.estimate?" [estimated]":"");
    let s;
    if(e.type==="feed"){ const fl=FLOURS.filter(x=>e[x.k]).map(x=>`${e[x.k]}g ${x.label}`).join(" + "); s=`FEED ${e.starter}g starter + ${fl} + ${e.water}g water (${ratioStr(e)})`; }
    else if(e.type==="check"){ const L=LV[e.level]||LEVELS[1]; s=`RISE CHECK${hOf[e.id]!=null?` ${hrs(hOf[e.id])} after last feed`:""}: ${L.label} (${L.sub} vs hair tie)${e.fell?", rose and fell back":""}${e.liquid?", liquid on top":""}${e.bubbles?`, bubbles: ${e.bubbles}`:""}${e.top?`, top: ${e.top}`:""}`; }
    else s="NOTE";
    if(e.smells&&e.smells.length) s+=`; smell: ${e.smells.join(", ")}`;
    if(e.note) s+=`; note: ${e.note}`;
    if(e.photos&&e.photos.length) s+=`; ${e.photos.length} photo(s)`;
    return when+" — "+s;
  }).join("\n");
}

/* ---------- Ask Claude (no paid AI: hands the journal to her own Claude account) ---------- */
const A = {draft:"", last:""};
const SUGGEST = ["How is Mabel doing?","When should I check her tonight?","Why does she smell like acetone?","When can I bake my first loaf?","Should I change her feeding ratio?"];
function context(){
  const C=coach(); const now=new Date(); const m=S.meta||{};
  return `I'm a first-time sourdough baker. Below is the journal for my starter, ${m.name||"Mabel"} (born ${new Date(m.born||Date.UTC(2026,10,5,22,45)).toDateString()}), from my tracking app. Please answer my question at the end.
About me:
- I mainly use my phone. No thermometer and I don't want one: work out how warm my kitchen runs from how fast she rises. Water temperature by feel is fine.
- Rise is judged against a hair tie on the jar marking her level right after feeding.
- My app's ready-to-bake rule: she doubles within 4–8 hours of a feed, three feeds in a row.
- I avoid gluten by choice (not celiac). Plan: learn on wheat loaves first, then move her to gluten-free bread flour for lower-gluten bread.
- Usual feed: about ${m.feedTime||"17:00"} daily.
Please be warm, plain and short, with concrete next steps and clock times in my local time. Base it on the log; if the log doesn't show something, say so and tell me what to log. Don't invent numbers.
My local time now: ${now.toLocaleString([], {weekday:"long",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}.
App's coach summary: status ${C.status}; doubled-in-window streak ${C.streak} of 3; typical peak ${C.peak?hrs(C.peak.h)+" after feed":"not seen yet"}; kitchen read ${C.kitchen?C.kitchen.label+" ("+C.kitchen.range+")":"not enough data"}.
Journal, oldest first:
${logText()}`;
}
function buildPrompt(q){ return context()+"\n\nMy question: "+(q.trim()||"How is she doing, and what should I do next?"); }
function renderAsk(){
  const q=A.draft;
  return `<section class="card"><h2>Ask Claude</h2>
    <p class="muted" style="margin:6px 0 0;font-size:15px">Type a question about ${esc((S.meta&&S.meta.name)||"Mabel")}. The button copies your question with her whole journal and opens Claude on your own account. If the question isn't already filled in there, tap the message box and paste.</p>
    <div class="opts" style="margin-top:12px">${SUGGEST.map(s=>`<button type="button" class="opt" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>
    <div class="field" style="margin-top:12px"><label for="ask-in">Your question</label><textarea id="ask-in" placeholder="Ask about ${esc((S.meta&&S.meta.name)||"Mabel")}…">${esc(q)}</textarea></div>
    <div class="stack"><button type="button" class="btn primary" data-askclaude>Copy and open Claude</button><button type="button" class="btn" data-copyonly>Just copy it</button></div>
    <p class="muted" style="font-size:14px;margin:12px 0 0">Want Claude to see her? Add a photo from your camera roll in Claude, too.</p>
    <details style="margin-top:10px"><summary class="muted" style="font-size:14px">See exactly what gets copied</summary><div class="preview">${esc(buildPrompt(q))}</div></details>
  </section>`;
}
function copyText(t){
  try{ if(navigator.clipboard && window.isSecureContext){ return navigator.clipboard.writeText(t).then(()=>true,()=>fallbackCopy(t)); } }catch(_){}
  return Promise.resolve(fallbackCopy(t));
}
function fallbackCopy(t){ const ta=document.createElement("textarea"); ta.value=t; ta.setAttribute("readonly",""); ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select(); let ok=false; try{ ok=document.execCommand("copy"); }catch(_){} ta.remove(); return ok; }
function askClaude(open){
  const p = buildPrompt(A.draft);
  const copied = copyText(p);
  if(open){
    const enc = encodeURIComponent(p);
    const url = enc.length < 7500 ? "https://claude.ai/new?q="+enc : "https://claude.ai/new";
    window.open(url, "_blank", "noopener");
  }
  copied.then(ok=>toast(ok ? (open?"Copied. Paste in Claude if it's not filled in.":"Copied. Paste it into Claude.") : "Couldn't copy. Open “See exactly what gets copied” and copy by hand."));
}

/* ---------- events ---------- */
document.addEventListener("click", ev=>{
  const t=ev.target;
  const tab=t.closest("nav.tabs button"); if(tab){ S.tab=tab.dataset.tab; render(); window.scrollTo(0,0); try{localStorage.setItem("mabel-tab",S.tab);}catch(_){} return; }
  const sq=t.closest("[data-q]"); if(sq){ A.draft=sq.dataset.q; render(); return; }
  if(t.closest("[data-askclaude]")){ askClaude(true); return; }
  if(t.closest("[data-copyonly]")){ askClaude(false); return; }
  const au=t.closest("[data-au]"); if(au){ AU.mode=au.dataset.au; AU.err=""; AU.ok=""; renderAuth(); return; }
  if(t.closest("[data-openmenu]")){ openMenu(); return; }
  if(t.closest("[data-startersetup]")||t.closest("[data-starteredit]")){ openStarterForm(); return; }
  if(t.closest("[data-export]")){ exportBackup(); return; }
  if(t.closest("[data-signout]")){ $("#layer").innerHTML=""; sb.auth.signOut(); return; }
  if(t.closest("[data-closemenu]") || t.matches("[data-scrim2]")){ $("#layer").innerHTML=""; return; }
  const act=t.closest("[data-act]"); if(act){ openForm(act.dataset.act); return; }
  const ph=t.closest("[data-photo]"); if(ph){ ev.stopPropagation(); const [id,i]=ph.dataset.photo.split(":"); const e=S.entries.find(x=>x.id===id); if(e) lightbox(e,+i); return; }
  const ed=t.closest("[data-edit]"); if(ed){ if(!S.canWrite) return; const e=S.entries.find(x=>x.id===ed.dataset.edit); if(e) openForm(e.type,e); return; }
  const un=t.closest("[data-unconfirm]"); if(un){ const list=[...(S.meta.toConfirm||[])]; list.splice(+un.dataset.unconfirm,1); sb.from("starters").update({to_confirm:list}).eq("id",S.starter.id).then(r=>{ if(r.error) toast("Couldn't update"); else loadAll(); }); return; }
  if(t.closest(".lightbox")){ $("#layer").innerHTML=""; return; }
  if(!F) return;
  if(t.matches("[data-scrim]")){ closeSheet(); return; }
  if(t.closest("[data-close]")){ closeSheet(); return; }
  if(t.closest("[data-save]")){ save(); return; }
  if(t.closest("[data-showtime]")){ syncForm(); F.entry.at=Date.now(); F.showTime=true; drawSheet(); return; }
  const d=t.closest("[data-del]"); if(d){ if(d.dataset.del==="ask"){ syncForm(); F.confirmDel=true; drawSheet(); } else del(); return; }
  const st=t.closest("[data-step]"); if(st){ syncForm(); const [k,dv]=st.dataset.step.split(":"); F.entry[k]=Math.max(0,(F.entry[k]||0)+(+dv)); drawSheet(); return; }
  const lv=t.closest("[data-level]"); if(lv){ syncForm(); F.entry.level=lv.dataset.level; F.err=""; drawSheet(); return; }
  const bb=t.closest("[data-bub]"); if(bb){ syncForm(); F.entry.bubbles = F.entry.bubbles===bb.dataset.bub?null:bb.dataset.bub; drawSheet(); return; }
  const tp=t.closest("[data-top]"); if(tp){ syncForm(); F.entry.top = F.entry.top===tp.dataset.top?null:tp.dataset.top; drawSheet(); return; }
  const sm=t.closest("[data-smell]"); if(sm){ syncForm(); const s=new Set(F.entry.smells||[]); s.has(sm.dataset.smell)?s.delete(sm.dataset.smell):s.add(sm.dataset.smell); F.entry.smells=[...s]; drawSheet(); return; }
  const rp=t.closest("[data-rmph]"); if(rp){ syncForm(); const [p]=F.entry.photos.splice(+rp.dataset.rmph,1); if(p){ const ps=[p.path,p.thumb].filter(Boolean); if(F.added.includes(p.path)){ F.added=F.added.filter(x=>!ps.includes(x)); sb.storage.from(BUCKET).remove(ps).catch(()=>{}); } else F.removed.push(...ps); } drawSheet(); return; }
});
document.addEventListener("submit", ev=>{
  if(ev.target.id==="authform"){ ev.preventDefault(); submitAuth(); }
  if(ev.target.id==="starterform"){ ev.preventDefault(); saveStarter(); }
});
document.addEventListener("change", ev=>{ if(ev.target.id==="imp-file" && ev.target.files.length) importFile(ev.target.files[0]); });
document.addEventListener("input", ev=>{
  if(ev.target.id==="ask-in"){ A.draft=ev.target.value; const pv=document.querySelector(".preview"); if(pv) pv.textContent=buildPrompt(A.draft); }
  if(F && ev.target.matches("[data-gram]")){ syncForm(); const r=$("#ratio"); const e=F.entry; if(r) r.innerHTML=`Ratio <b class="num">${esc(ratioStr(e))}</b> · ${flourTotal(e)+(e.starter||0)+(e.water||0)} g in the jar`; }
});
document.addEventListener("change", ev=>{ if(F && ev.target.id==="f-photo" && ev.target.files.length) addPhotos([...ev.target.files]); });
document.addEventListener("keydown", ev=>{ if(ev.key==="Escape"){ if(F) closeSheet(); else $("#layer").innerHTML=""; } });
document.addEventListener("click", ev=>{ if(ev.target.closest("[data-menu]")) openMenu(); });
function lightbox(e,i){ const p=e.photos[i]; $("#layer").innerHTML=`<div class="lightbox" role="dialog" aria-label="Photo"><div><img src="${esc(photoSrc(p))}" alt="Mabel"><p>${esc(fmtD(e.at))}${e.timeKnown===false?"":" · "+esc(fmtT(e.at))} · tap to close</p></div></div>`; }

/* ---------- sign in ---------- */
const AU = {mode:"signin", err:"", ok:"", busy:false};
function renderAuth(){
  const m=AU.mode;
  const title = m==="signup"?"Make an account":m==="forgot"?"Reset your password":m==="newpass"?"Choose a new password":"Sign in";
  let f="";
  if(m!=="newpass") f+=`<div class="field"><label for="au-email">Email</label><input type="email" id="au-email" autocomplete="email" value="${esc(AU.email||"")}" required></div>`;
  if(m!=="forgot") f+=`<div class="field"><label for="au-pw">${m==="signin"?"Password":"New password"}</label><input type="password" id="au-pw" autocomplete="${m==="signin"?"current-password":"new-password"}" minlength="${m==="signin"?1:10}" required>${m!=="signin"?`<div class="muted" style="font-size:13px;margin-top:4px">At least 10 characters. A short phrase is easiest to remember.</div>`:""}</div>`;
  const btn = m==="signup"?"Create account":m==="forgot"?"Email me a reset link":m==="newpass"?"Save new password":"Sign in";
  let links="";
  if(m==="signin") links=`<button type="button" class="linkbtn" data-au="forgot">Forgot password?</button> · <button type="button" class="linkbtn" data-au="signup">New here? Make an account</button>`;
  else if(m!=="newpass") links=`<button type="button" class="linkbtn" data-au="signin">Back to sign in</button>`;
  $("#authview").innerHTML = `<div class="auth"><div class="card"><div class="eyebrow">Starter journal</div><h1>Mabel's Jar</h1><p class="muted">${esc(title)}</p>
    <form id="authform">${f}${AU.err?`<div class="err" role="alert">${esc(AU.err)}</div>`:""}${AU.ok?`<div class="ok" role="status">${esc(AU.ok)}</div>`:""}
    <button class="btn primary" ${AU.busy?"disabled":""}>${esc(btn)}</button></form>
    <div class="switch">${links}</div></div></div>`;
}
async function submitAuth(){
  const em=$("#au-email"), pw=$("#au-pw"); const email=em?em.value.trim():"", pass=pw?pw.value:""; if(em) AU.email=email;
  AU.err=""; AU.ok=""; AU.busy=true; renderAuth();
  const here = location.origin+location.pathname;
  try{
    if(AU.mode==="signin"){ const {error}=await sb.auth.signInWithPassword({email, password:pass}); if(error) throw error; }
    else if(AU.mode==="signup"){
      if(pass.length<10) throw new Error("Use at least 10 characters for your password.");
      const {data, error}=await sb.auth.signUp({email, password:pass, options:{emailRedirectTo:here}}); if(error) throw error;
      if(!data.session){ AU.ok="Check your email and tap the confirm link, then sign in here."; AU.mode="signin"; }
    }
    else if(AU.mode==="forgot"){ const {error}=await sb.auth.resetPasswordForEmail(email, {redirectTo:here}); if(error) throw error; AU.ok="If that email has an account, a reset link is on its way."; }
    else if(AU.mode==="newpass"){
      if(pass.length<10) throw new Error("Use at least 10 characters for your password.");
      const {error}=await sb.auth.updateUser({password:pass}); if(error) throw error; AU.mode="signin"; toast("Password saved"); showApp();
    }
  }catch(err){ AU.err = /invalid login/i.test(err.message||"") ? "That email and password don't match." : /not confirmed/i.test(err.message||"") ? "Confirm your email first: tap the link we sent you." : (err.message||"Something went wrong. Try again."); }
  AU.busy=false; if(!S.user || AU.mode==="newpass") renderAuth();
}
function showAuth(){ $("#app").hidden=true; $("nav.tabs").hidden=true; $("#authview").hidden=false; renderAuth(); }
function showApp(){ $("#authview").hidden=true; $("#app").hidden=false; $("nav.tabs").hidden=false; render(); }

/* ---------- settings, starter setup, import, export ---------- */
function openMenu(){
  $("#layer").innerHTML = `<div class="scrim" data-scrim2><div class="sheet menu" role="dialog" aria-modal="true" aria-label="Settings"><h2>Settings</h2>
    <p class="muted" style="margin:0 0 14px;font-size:14px">Signed in as ${esc(S.user&&S.user.email)}</p>
    <div class="stack">
      ${S.starter?`<button type="button" class="btn" data-starteredit>Starter name and usual feed time</button>`:""}
      <label class="btn">Import a history file<input type="file" id="imp-file" accept=".json,application/json" hidden></label>
      <button type="button" class="btn" data-export>Download a backup of the journal</button>
      <button type="button" class="btn danger" data-signout>Sign out</button>
      <button type="button" class="btn" data-closemenu>Close</button>
    </div><div id="imp-status"></div></div></div>`;
}
function openStarterForm(){
  const m=S.meta||{}; const born=m.born?new Date(m.born):new Date();
  const p=n=>String(n).padStart(2,"0");
  $("#layer").innerHTML = `<div class="scrim" data-scrim2><div class="sheet" role="dialog" aria-modal="true" aria-label="Your starter"><h2>${S.starter?"Your starter":"Set up your starter"}</h2>
    <form id="starterform">
    <div class="field"><label for="st-name">Name</label><input type="text" id="st-name" value="${esc(m.name||"")}" placeholder="Mabel" required></div>
    <div class="field"><label for="st-born">Started on</label><input type="date" id="st-born" value="${born.getFullYear()}-${p(born.getMonth()+1)}-${p(born.getDate())}"></div>
    <div class="field"><label for="st-feed">Usual feed time</label><input type="time" id="st-feed" value="${esc(m.feedTime||"17:00")}"></div>
    <div class="sheetbtns"><span></span><div style="display:flex;gap:10px"><button type="button" class="btn" data-closemenu>Cancel</button><button class="btn primary">Save</button></div></div>
    </form></div></div>`;
}
async function saveStarter(){
  const name=$("#st-name").value.trim()||"Mabel", born=$("#st-born").value, feed=$("#st-feed").value||"17:00";
  const row={name, born: born?new Date(born+"T12:00").toISOString():null, feed_time:feed};
  if(S.starter && S.meta && S.meta.born && born && new Date(S.meta.born).toDateString()===new Date(born+"T12:00").toDateString()) row.born=new Date(S.meta.born).toISOString();
  const res = S.starter ? await sb.from("starters").update(row).eq("id",S.starter.id) : await sb.from("starters").insert(row);
  if(res.error){ toast("Couldn't save. Try again."); return; }
  $("#layer").innerHTML=""; toast("Saved"); loadAll();
}
async function exportBackup(){
  try{
    const {data:st}=await sb.from("starters").select("*");
    const {data:en}=await sb.from("entries").select("*").order("at");
    const blob=new Blob([JSON.stringify({format:"mabels-jar-backup", exported:new Date().toISOString(), starters:st, entries:en},null,2)],{type:"application/json"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="mabels-jar-backup-"+new Date().toISOString().slice(0,10)+".json"; document.body.appendChild(a); a.click(); a.remove();
    toast("Backup downloaded. Photos stay safe in your account.");
  }catch(_){ toast("Couldn't make the backup. Try again."); }
}
function b64Blob(b64){ const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return new Blob([u],{type:"image/jpeg"}); }
async function importFile(file){
  const st=$("#imp-status"); const say=(t,pct)=>{ if(st) st.innerHTML=`<p style="margin:14px 0 0;font-size:15px">${esc(t)}</p>${pct!=null?`<div class="progress"><i style="width:${pct}%"></i></div>`:""}`; };
  let data; try{ data=JSON.parse(await file.text()); }catch(_){ say("That file isn't a Mabel's Jar history file."); return; }
  if(!data || data.format!=="mabels-jar-import" || !Array.isArray(data.entries)){ say("That file isn't a Mabel's Jar history file."); return; }
  try{
    say("Getting ready…",0);
    if(!S.starter){
      const s=data.starter||{}; const {data:made, error}=await sb.from("starters").insert({name:s.name||"Mabel", born:s.born||null, feed_time:s.feed_time||"17:00", to_confirm:s.to_confirm||[]}).select().single();
      if(error) throw error; S.starter=made;
    }
    const {data:have, error:e2}=await sb.from("entries").select("source_id").eq("starter_id",S.starter.id).not("source_id","is",null);
    if(e2) throw e2;
    const done=new Set((have||[]).map(r=>r.source_id));
    const todo=data.entries.filter(e=>!done.has(e.source_id));
    let n=0;
    for(const e of todo){
      say(`Bringing over ${e.date_label||"entries"}… (${n+1} of ${todo.length})`, Math.round(n/todo.length*100));
      const photos=[];
      for(let i=0;i<(e.photos||[]).length;i++){
        const ph=data.photos[e.photos[i]]; if(!ph) continue;
        photos.push(await uploadPhoto(b64Blob(ph.full), b64Blob(ph.thumb), `history-${e.source_id}-${i}`));
      }
      const row=entryToRow({...e.entry, photos});
      const {error}=await sb.from("entries").insert({...row, starter_id:S.starter.id, source_id:e.source_id});
      if(error) throw error;
      n++;
    }
    say(todo.length?`Done. Brought over ${todo.length} entries.`:"Everything in that file is already in your journal.",100);
    loadAll();
  }catch(err){ console.error("import failed", err && (err.message||JSON.stringify(err))); say("The import stopped partway (check your connection). Run it again with the same file: it picks up where it left off."); }
}

/* ---------- boot ---------- */
function setupNeeded(){
  $("#authview").hidden=false; $("#app").hidden=true; $("nav.tabs").hidden=true;
  $("#authview").innerHTML=`<div class="auth"><div class="card"><h1>Mabel's Jar</h1><p class="muted">This copy isn't connected to its database yet. Fill in config.js with the Supabase project URL and anon key.</p></div></div>`;
}
try{ const t=localStorage.getItem("mabel-tab"); if(t) S.tab=t; }catch(_){}
if(!CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase){ setupNeeded(); return; }
sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
let started=false;
sb.auth.onAuthStateChange((event, session)=>{
  if(event==="PASSWORD_RECOVERY"){ S.user=session&&session.user; AU.mode="newpass"; showAuth(); return; }
  const u = session && session.user;
  if(u && (!S.user || S.user.id!==u.id)){ S.user=u; S.loaded=false; showApp(); setTimeout(loadAll,0); }
  else if(!u){ S.user=null; S.entries=[]; S.starter=null; S.meta=null; if(AU.mode==="newpass") AU.mode="signin"; showAuth(); }
  else S.user=u;
  started=true;
});
setInterval(()=>{ if(S.user && !F && !$("#layer").innerHTML && S.tab!=="ask") render(); }, 60e3);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible" && S.user && !F) loadAll(); });
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});

})();
