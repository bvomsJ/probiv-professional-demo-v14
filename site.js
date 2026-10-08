
/* PROBIV.CC DEMO CORE v6
   Everything is synthetic/local-only. No real accounts, transactions or external operations.
*/
(function(){
"use strict";


window.getMedia=function(id){return (DEMO_DB.media||[]).find(m=>m.id===String(id)||m.id===Number(id));};
window.renderMedia=function(ids,cls="media-stack"){
 const arr=(Array.isArray(ids)?ids:[]).map(getMedia).filter(m=>m&&m.enabled!==false);
 if(!arr.length)return "";
 return `<div class="${cls}">${arr.map(m=>{const tag=(m.type||"").startsWith("video/")?`<video src="${esc(m.src)}" controls loop></video>`:`<img src="${esc(m.src)}" alt="${esc(m.alt||m.name||"")}">`;return `<div class="media-item">${safeHref(m.href)?`<a href="${esc(safeHref(m.href))}" target="_blank" rel="noopener">${tag}</a>`:tag}</div>`}).join("")}</div>`;
};
window.mediaSlot=function(slot,cls="media-slot"){const ids=(DEMO_DB.site&&DEMO_DB.site.mediaSlots&&DEMO_DB.site.mediaSlots[slot])||[];return renderMedia(ids,cls);};
window.getUser=function(id){return (DEMO_DB.users||[]).find(u=>u.id===Number(id))||null};
window.getThread=function(id){return (DEMO_DB.threads||[]).find(t=>t.id===Number(id))};
window.esc=function(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))};
window.avatar=function(u,cls="avatar"){u=u||{};return `<div class="${cls}" style="background:${esc(u.color||"#65745c")}">${esc(u.avatar||"?")}</div>`};
window.q=function(n){return new URLSearchParams(location.search).get(n)};
window.safeHref=function(value){const raw=String(value??"").trim();if(!raw)return "";try{const u=new URL(raw,location.href);if(u.protocol==="http:"||u.protocol==="https:")return u.href;if(u.protocol==="mailto:"||u.protocol==="tel:")return raw;return u.origin===location.origin?u.href:""}catch{return ""}};
window.fmt=function(n){return new Intl.NumberFormat("ru-RU").format(Number(n)||0)};
window.saveDB=function(){localStorage.setItem("PROBIV_DEMO_DB",JSON.stringify(DEMO_DB));localStorage.setItem("PROBIV_DB_VERSION","v7")};
window.saveDemoDB=window.saveDB;
window.isPreviewMode=function(){return new URLSearchParams(location.search).get("preview")==="1"};
window.isMember=function(){
 const flag=localStorage.getItem("PROBIV_MEMBER")==="1";
 const uid=Number(localStorage.getItem("PROBIV_USER_ID"));
 const valid=uid>0 && !!(DEMO_DB.users||[]).find(u=>u.id===uid);
 if(flag&&!valid){localStorage.removeItem("PROBIV_MEMBER");localStorage.removeItem("PROBIV_USER_ID");localStorage.removeItem("PROBIV_INVITE_CODE");return false}
 return flag&&valid;
};
window.isAdmin=function(){
 const ok=sessionStorage.getItem("PROBIV_ADMIN_SESSION")==="DEMO-ADMIN-AUTH" && sessionStorage.getItem("PROBIV_ADMIN")==="1";
 if(!ok){localStorage.removeItem("PROBIV_ADMIN");localStorage.removeItem("PROBIV_ADMIN_SESSION");}
 return ok;
};
window.requireAdmin=function(){if(!isAdmin()){localStorage.removeItem("PROBIV_ADMIN");localStorage.removeItem("PROBIV_ADMIN_SESSION");location.href="login.html?return="+encodeURIComponent(location.href);return false}return true};
window.currentUser=function(){return getUser(Number(localStorage.getItem("PROBIV_USER_ID"))||0)};
window.profileHref=function(id){const dest="profile.html?id="+encodeURIComponent(Number(id)||0);return (isMember()||isAdmin())?dest:"login.html?return="+encodeURIComponent(dest)};
window.logout=function(){localStorage.removeItem("PROBIV_MEMBER");localStorage.removeItem("PROBIV_INVITE_CODE");localStorage.removeItem("PROBIV_USER_ID");localStorage.removeItem("PROBIV_ADMIN");localStorage.removeItem("PROBIV_ADMIN_SESSION");sessionStorage.removeItem("PROBIV_ADMIN");sessionStorage.removeItem("PROBIV_ADMIN_SESSION");location.href="index.html"};
window.setMember=function(code){
 code=String(code||"").trim();
 const x=(DEMO_DB.invites||[]).find(i=>i.active&&i.code===code&&(!i.maxUses||i.uses<i.maxUses));
 if(!x)return false;
 x.uses=(x.uses||0)+1;saveDB();
 localStorage.setItem("PROBIV_MEMBER","1");
 localStorage.setItem("PROBIV_INVITE_CODE",code);
 const uid=Number(localStorage.getItem("PROBIV_USER_ID"));
 if(!(uid>0 && (DEMO_DB.users||[]).some(u=>u.id===uid))){const first=(DEMO_DB.users||[])[0];if(first)localStorage.setItem("PROBIV_USER_ID",String(first.id));}
 return true;
};
window.authLinks=function(){
 document.querySelectorAll("[data-auth]").forEach(el=>{
   el.innerHTML=isMember()
    ? `<span class="auth-state">Участник</span> · <a href="profile.html?id=${currentUser().id}">Профиль</a> · <a href="#" onclick="logout();return false">Выйти</a>`
    : `<a href="login.html?return=${encodeURIComponent(location.href)}">Вход</a> · <a href="register.html?return=${encodeURIComponent(location.href)}">Регистрация</a>`;
 });
};
window.canGuestRead=function(t){return (window.isPreviewMode&&window.isPreviewMode()&&isAdmin()) || !t || t.guestAccess!=="invite" || isMember()};
window.gatePage=function(t){
 if(canGuestRead(t))return true;
 const host=document.getElementById("threadPage");if(!host)return false;
 host.innerHTML=`<div class="page-panel access-gate">
 <div class="lock-icon">🔒</div><div class="demo-label">ДЕМО-ДОСТУП</div>
 <h1>Просмотр доступен только участникам</h1>
 <p>Эта синтетическая тема закрыта для гостей. Для демонстрации необходимо войти или активировать код приглашения.</p>
 <div class="gate-note"><b>Доступ:</b> вход в демонстрационный аккаунт или регистрация по приглашению.</div>
 <div class="gate-actions"><a class="gold-btn gate-link" href="invite.html?return=${encodeURIComponent(location.href)}">Код приглашения</a>
 <a class="small-btn gate-link" href="login.html?return=${encodeURIComponent(location.href)}">Войти</a></div>
 <div class="meta" style="margin-top:15px">Все сведения на этой странице синтетические.</div></div>`;
 return false;
};

/* One reaction per local demo user/post. Clicking again removes it.
   This prevents the old infinite-counter bug. */
window.reactToPost=function(threadId,postIndex,type){
 const t=getThread(threadId); if(!t||!t.posts||!t.posts[postIndex])return;
 const uid=Number(localStorage.getItem("PROBIV_USER_ID"))||0;
 if(!uid){location.href="login.html?return="+encodeURIComponent(location.href);return}
 const p=t.posts[postIndex];
 p.reactions=p.reactions||{};
 p.reactions[uid]=p.reactions[uid]||null;
 const prev=p.reactions[uid];
 const author=getUser(p.user);
if(prev===type){
   p.reactions[uid]=null;
   const key=type==="like"?"likes":"dislikes";
   p[key]=Math.max(0,(p[key]||0)-1);
   if(author)author[key]=Math.max(0,(author[key]||0)-1);
 }else{
   if(prev){
     const oldKey=prev==="like"?"likes":"dislikes";
     p[oldKey]=Math.max(0,(p[oldKey]||0)-1);
     if(author)author[oldKey]=Math.max(0,(author[oldKey]||0)-1);
   }
   p.reactions[uid]=type;
   const key=type==="like"?"likes":"dislikes";
   p[key]=(p[key]||0)+1;
   if(author)author[key]=(author[key]||0)+1;
 }
 saveDB();
 if(typeof renderThread==="function")renderThread();
};

/* Rows are actual links, so keyboard navigation and middle-click also work. */
window.threadRow=function(t){
 const u=getUser(t.author)||{};
 return `<a class="thread-row" href="thread.html?id=${t.id}">
   ${avatar(u)}
   <div class="thread-main"><div class="thread-title">${t.pinned?'<span class="tag">ВАЖНО</span>':t.category==="Полезное"?'<span class="tag gold">Полезное</span>':""}${esc(t.title)}</div>
   <div class="meta"><a href="${profileHref(u.id)}" onclick="event.stopPropagation()">${esc(u.name||"Неизвестный пользователь")}</a> · ${esc(t.date)} · ${esc(t.category)}</div></div>
   <div class="stats"><span>Ответы: ${fmt(t.answers)}</span><span>Просмотры: ${fmt(t.views)}</span></div>
   <div class="date">${esc(t.date)}</div><div class="mini">${esc(u.avatar||"?")}</div>
 </a>`;
};

/* Resolve all data-driven homepage blocks to real local pages. */
window.renderVisualAds=function(){
 const ads=(DEMO_DB.ads||[]).filter(a=>a.enabled!==false && a.mediaId).slice().sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
 const anchors={};document.querySelectorAll('[data-home-media-anchor]').forEach(el=>{anchors[el.dataset.homeMediaAnchor]=el});
 const old=document.querySelectorAll('.visual-home-ad');old.forEach(x=>x.remove());
 ads.forEach(a=>{const anchor=anchors[a.position||a.slot||'pageTop'];if(!anchor)return;const m=getMedia(a.mediaId);if(!m||m.enabled===false)return;
   const wrap=document.createElement('div');wrap.className='visual-home-ad';wrap.dataset.adId=a.id;wrap.style.width=Math.max(1,Math.min(100,Number(a.width)||100))+'%';wrap.style.maxWidth=a.maxWidth>0?a.maxWidth+'px':'';wrap.style.height=a.height>0?a.height+'px':'auto';wrap.style.margin=(a.align==='left'?'8px 0 8px 0':a.align==='right'?'8px 0 8px auto':'8px auto');
   const frame=document.createElement('div');frame.className='visual-home-frame';frame.style.height=a.height>0?a.height+'px':'auto';
   const tag=(m.type||'').startsWith('video/')?document.createElement('video'):document.createElement('img');tag.src=m.src;tag.alt=m.alt||m.name||'';tag.style.width='100%';tag.style.height=a.height>0?'100%':'auto';tag.style.objectFit='contain';if(tag.tagName==='VIDEO'){tag.controls=true;tag.loop=true}
   frame.appendChild(tag);wrap.appendChild(frame);if(a.label){const cap=document.createElement('div');cap.className='visual-home-caption';cap.textContent=a.label;wrap.appendChild(cap)}
   const href=safeHref(m.href);if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener';link.style.display='block';link.appendChild(wrap);anchor.appendChild(link)}else anchor.appendChild(wrap);
 });
 if(window.isPreviewMode&&window.isPreviewMode()) enableVisualBuilder();
};
window.enableVisualBuilder=function(){
 if(window.__visualBuilderBound)return;window.__visualBuilderBound=true;
 const style=document.createElement('style');style.textContent=`[data-home-media-anchor]{position:relative;min-height:18px;border:1px dashed rgba(46,120,180,.45);background:rgba(90,160,210,.05);margin:4px 0}[data-home-media-anchor]:before{content:'↕ ПЕРЕТАЩИ БАННЕР СЮДА';display:block;text-align:center;font:10px Arial;color:#3478a7;padding:3px;opacity:.75}.visual-home-ad{position:relative;cursor:grab;outline:2px solid rgba(44,115,170,.55);outline-offset:2px;box-sizing:border-box}.visual-home-ad:after{content:'↘ ИЗМЕНИТЬ РАЗМЕР';position:absolute;right:0;bottom:0;background:#3478a7;color:white;font:9px Arial;padding:3px 5px;cursor:nwse-resize}.visual-home-ad.builder-drag{opacity:.65;cursor:grabbing}.visual-home-ad .visual-home-frame{overflow:hidden}.visual-home-ad img,.visual-home-ad video{max-width:100%;display:block}`;document.head.appendChild(style);
 const ads=document.querySelectorAll('.visual-home-ad');ads.forEach(ad=>{
  if(ad.__builder)return;ad.__builder=true;
  let sx=0,sy=0,sw=0,sh=0,mode='drag';
  ad.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();ad.setPointerCapture(e.pointerId);const r=ad.getBoundingClientRect();sx=e.clientX;sy=e.clientY;sw=r.width;sh=r.height;mode=(e.clientX>r.right-22&&e.clientY>r.bottom-22)?'resize':'drag';ad.classList.add('builder-drag');});
  ad.addEventListener('pointermove',e=>{if(!ad.hasPointerCapture(e.pointerId))return;const a=(DEMO_DB.ads||[]).find(x=>Number(x.id)===Number(ad.dataset.adId));if(!a)return;if(mode==='resize'){const parent=ad.parentElement.getBoundingClientRect();const nw=Math.max(40,Math.min(parent.width,sw+(e.clientX-sx)));a.width=Math.round(nw/parent.width*100);a.height=Math.max(0,Math.round(sh+(e.clientY-sy)));ad.style.width=a.width+'%';ad.style.height=a.height+'px';const fr=ad.querySelector('.visual-home-frame');if(fr)fr.style.height=a.height+'px';}else{const y=e.clientY;let best=null,dist=1e9;document.querySelectorAll('[data-home-media-anchor]').forEach(z=>{const r=z.getBoundingClientRect();const d=Math.abs(y-(r.top+r.height/2));if(d<dist){dist=d;best=z}});if(best){a.position=best.dataset.homeMediaAnchor;const clone=ad.parentElement===best?null:ad;best.appendChild(ad);}}});
  ad.addEventListener('pointerup',e=>{if(!ad.hasPointerCapture(e.pointerId))return;ad.releasePointerCapture(e.pointerId);ad.classList.remove('builder-drag');const a=(DEMO_DB.ads||[]).find(x=>Number(x.id)===Number(ad.dataset.adId));if(a){sessionStorage.setItem('PROBIV_PREVIEW_DB',JSON.stringify(DEMO_DB));window.parent.postMessage({type:'probiv-ad-change',id:a.id,changes:{width:a.width,height:a.height,position:a.position,align:a.align,order:a.order}},'*');}});
 });
};
window.renderHome=function(){
 const pin=document.getElementById("pinned"),normal=document.getElementById("normal");
 if(pin)pin.innerHTML=(DEMO_DB.threads||[]).filter(t=>t.pinned).map(threadRow).join("");
 if(normal)normal.innerHTML=(DEMO_DB.threads||[]).filter(t=>!t.pinned).map(threadRow).join("");
 const hot=document.getElementById("hotTopics");
 if(hot)hot.innerHTML=(DEMO_DB.hotTopics||[]).map(x=>{
   const t=(DEMO_DB.threads||[]).find(t=>t.title===x.title);
   return `<a class="hot-row" href="${t?"thread.html?id="+t.id:"search.html?q="+encodeURIComponent(x.title)}"><span class="mini-tag">${esc(x.tag)}</span><div><b>${esc(x.title)}</b><small>${esc(getUser(x.author)?.name||"Демо") } · ${fmt(x.answers)} ответов · ${fmt(x.views)} просмотров</small></div></a>`;
 }).join("");
 const recent=document.getElementById("recentTopics");
 if(recent)recent.innerHTML=(DEMO_DB.recent||[]).map(x=>{
   const t=(DEMO_DB.threads||[]).find(t=>t.title===x.title);
   return `<a class="recent-row" href="${t?"thread.html?id="+t.id:"search.html?q="+encodeURIComponent(x.title)}"><span>${x.pinned?"📌":"»"}</span><div><b>${esc(x.title)}</b><small>${esc(getUser(x.author)?.name||"Демо")} · ${esc(x.date)}</small></div><em>💬 ${fmt(x.answers)}</em></a>`;
 }).join("");
 const users=document.getElementById("newUsers");
 if(users)users.innerHTML=(DEMO_DB.users||[]).slice().reverse().map(u=>`<a href="${profileHref(u.id)}" class="user-line">${avatar(u,"tiny-avatar")}<span>${esc(u.name)}</span><i>${u.online?"●":"○"}</i></a>`).join("");
 const stat=document.getElementById("forumStats");
 if(stat)stat.innerHTML=`<a href="search.html?type=threads"><b>${fmt(DEMO_DB.stats.topics)}</b><span>Темы</span></a><a href="search.html?type=messages"><b>${fmt(DEMO_DB.stats.messages)}</b><span>Сообщения</span></a><a href="search.html?type=users"><b>${fmt(DEMO_DB.stats.users)}</b><span>Пользователи</span></a><a href="search.html?type=reputation"><b>${fmt(DEMO_DB.stats.reputation)}</b><span>Репутация</span></a>`;
 renderVisualAds();
 const cloud=document.getElementById("tagCloud");
 if(cloud)cloud.innerHTML=(DEMO_DB.tagCloud||["форум","отзывы","обсуждения","гарант","профиль","проверка","демо","рейтинг","новости"]).map(x=>`<a href="search.html?q=${encodeURIComponent(x)}">${x}</a>`).join(" ");
 authLinks();
 bindManagedLinks();
};

/* Configurable navigation/ads. */
window.bindManagedLinks=function(){
 const links=DEMO_DB.links||{};
 document.querySelectorAll("[data-link-key]").forEach(a=>{
   const key=a.dataset.linkKey, cfg=links[key];
   if(!cfg)return;
   if(cfg.label){
     const strong=a.querySelector("strong");
     if(strong){
       Array.from(a.childNodes).filter(n=>n.nodeType===3).forEach(n=>n.remove());
       a.appendChild(document.createTextNode(cfg.label));
     }else a.textContent=cfg.label;
   }
   a.href=cfg.href||"#";
   a.onclick=null;
   if(cfg.auth&&!isMember()){
     a.href="login.html?return="+encodeURIComponent(location.href);
   }
 });
 document.querySelectorAll("[data-demo-link]").forEach(a=>{
   a.onclick=function(e){e.preventDefault();location.href=a.dataset.demoLink||"help.html"};
 });
};

/* Convert accidental empty/hash anchors to a meaningful local destination. */
window.auditAnchors=function(){
 document.querySelectorAll("a[href]").forEach(a=>{
   const href=(a.getAttribute("href")||"").trim();
   if(!href||href==="#"||href.toLowerCase().startsWith("javascript:")){
     if(a.dataset.keepHash!=="1")a.href="help.html";
   }
 });
};

window.applySiteConfig=function(){
 const site=DEMO_DB.site||{};
 document.querySelectorAll(".logo").forEach(x=>x.textContent=site.title||"PROBIV.CC");
 document.querySelectorAll(".tagline").forEach(x=>x.textContent=site.subtitle||"");
 document.querySelectorAll(".network-ad").forEach(x=>x.textContent=site.networkAd||site.topAd||"DEMO");
 document.querySelectorAll(".demo-strip").forEach(x=>x.textContent=site.demoLabel||"ДЕМО · СИНТЕТИЧЕСКИЕ ДАННЫЕ");
 const labels=site.homeLabels||{};
 document.querySelectorAll("[data-home-label]").forEach(x=>{const k=x.dataset.homeLabel;if(labels[k])x.textContent=labels[k]});
 document.querySelectorAll("footer").forEach(x=>x.textContent=site.footer||"ДЕМО-ФОРУМ");
 if(site.background){document.body.style.backgroundImage='linear-gradient(rgba(237,231,218,.10),rgba(237,231,218,.10)),url("'+String(site.background).replace(/"/g,'')+'")';}
 const ads=document.querySelectorAll(".ad");
 if(ads[0]){ads[0].innerHTML=site.topAd||ads[0].textContent; if(site.mediaSlots?.topAd)ads[0].innerHTML+=mediaSlot("topAd");}
 if(ads[1]){ads[1].innerHTML=esc(site.heroBanners?.[0]||"")+mediaSlot("hero1");}
 if(ads[2]){ads[2].innerHTML=esc(site.heroBanners?.[1]||"")+mediaSlot("hero2");}
 document.querySelectorAll("[data-media-slot]").forEach(el=>{el.innerHTML=mediaSlot(el.dataset.mediaSlot);});
 const demoStrip=document.querySelector(".demo-strip");
 if(demoStrip && !document.querySelector(".global-media-top")){const x=document.createElement("div");x.className="shell global-media-top";x.innerHTML=mediaSlot("globalTop");if(x.innerHTML)demoStrip.insertAdjacentElement("afterend",x);}
 const footer=document.querySelector("footer");
 if(footer && !document.querySelector(".global-media-bottom")){const x=document.createElement("div");x.className="shell global-media-bottom";x.innerHTML=mediaSlot("globalBottom");if(x.innerHTML)footer.insertAdjacentElement("beforebegin",x);}
 if(document.querySelector("[data-home-media-anchor]")) renderVisualAds();
};
window.startSite=function(){
 applySiteConfig();authLinks();bindManagedLinks();auditAnchors();
 document.querySelectorAll('[data-link-key="admin"],a[href="admin.html"]').forEach(a=>{a.style.display=isAdmin()?"":"none"});
 document.querySelectorAll('[data-link-key="profile"]').forEach(a=>{a.href=isMember()&&currentUser()?profileHref(currentUser().id):('login.html?return='+encodeURIComponent(location.href))});
};
document.addEventListener("DOMContentLoaded",startSite);
})();
