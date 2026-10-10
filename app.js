const KEY="probiv_demo_state_v3";

const seed={
  site:{
    title:"PROBIV.CC",
    subtitle:"ПРОВЕРЯЕМ • НЕПРОВЕРЯЕМОЕ • ОБСУЖДАЕМ • НЕОБЫЧНОЕ",
    footer:"ЭВАКУАЦИЯ | РЕШЕНИЕ УГОЛОВНЫХ ДЕЛ | ПОМОЩЬ В РОЗЫСКЕ | ПРОВЕРКА НА РАЗРАБОТКУ | КОНСУЛЬТАЦИИ"
  },
  users:[
    {id:1,name:"reagent",role:"Обычный",rating:184,posts:954,likes:1495,dislikes:128,joined:"4/11/14",avatar:"R",color:"#c72aa0",status:"Проверенный пользователь"},
    {id:2,name:"Alex22",role:"Участник",rating:92,posts:438,likes:712,dislikes:44,joined:"7/06/19",avatar:"A",color:"#2b6285",status:"Активный"},
    {id:3,name:"Harper",role:"Старожил",rating:421,posts:1820,likes:3821,dislikes:91,joined:"12/02/18",avatar:"H",color:"#6b6651",status:"Старожил"},
    {id:4,name:"MISTER X",role:"Участник",rating:57,posts:214,likes:301,dislikes:37,joined:"21/08/19",avatar:"M",color:"#4f5964",status:"Активный"},
    {id:5,name:"Sofia",role:"Модератор",rating:604,posts:2611,likes:6010,dislikes:66,joined:"16/10/18",avatar:"S",color:"#8b3e52",status:"Модератор"}
  ],
  threads:[
    {id:101,title:"ВАЖНО: Вывод депозитов",author:1,date:"21/11/14",views:7128,answers:19,pinned:true,category:"Гарант-Сервис",
      posts:[
        {user:1,date:"21/11/14",text:"В теме даются учет внесения и вывода депозитов. Все суммы в этом демонстрационном макете являются вымышленными.",likes:14,dislikes:1},
        {user:2,date:"18/01/15",text:"@reagent внесение прошло, информация отображается в профиле. Спасибо за подробное описание.",likes:7,dislikes:0},
        {user:4,date:"19/01/15",text:"Подтверждаю: интерфейс понятный, историю операций видно в отдельном блоке.",likes:4,dislikes:0},
        {user:1,date:"20/01/15",text:"Добавил уточнение в первый пост. Напоминаю: это исключительно синтетическая демонстрация интерфейса.",likes:9,dislikes:1}
      ]},
    {id:102,title:"Обсуждение работы гаранта",author:3,date:"08/06/22",views:12950,answers:27,pinned:true,category:"Гарант-Сервис",
      posts:[
        {user:3,date:"08/06/22",text:"Создаю тему для отзывов и вопросов. Пишите, что можно улучшить в работе сервиса.",likes:31,dislikes:2},
        {user:2,date:"09/06/22",text:"Было бы удобно добавить отдельную историю статусов сделки.",likes:12,dislikes:1},
        {user:5,date:"10/06/22",text:"Предложение передано администрации. В следующей версии макета можно будет редактировать этот блок из админки.",likes:18,dislikes:0}
      ]},
    {id:103,title:"Харпер. Отзывы о работе через Гарант форума",author:3,date:"05/08/26",views:2001000,answers:6000,pinned:false,category:"Отзывы",
      posts:[
        {user:3,date:"05/08/26",text:"Собираем отзывы пользователей в одной теме. Напишите, что было удобно, а что хотелось бы изменить.",likes:48,dislikes:3},
        {user:1,date:"06/08/26",text:"По интерфейсу всё понятно. Хорошо бы видеть профиль автора прямо из сообщения.",likes:22,dislikes:1},
        {user:5,date:"07/08/26",text:"Сделано в демонстрационной версии: имя пользователя теперь открывает его профиль.",likes:36,dislikes:0}
      ]},
    {id:104,title:"Гарант теперь в Telegram",author:2,date:"16/10/22",views:27000,answers:12,pinned:false,category:"Обсуждения",
      posts:[
        {user:2,date:"16/10/22",text:"Тестовая тема про внешний канал связи. Ссылки здесь намеренно заменены описанием.",likes:10,dislikes:0},
        {user:4,date:"17/10/22",text:"А можно добавить уведомления о новых сообщениях?",likes:5,dislikes:0}
      ]},
    {id:105,title:"Видео про Гаранта! Смотреть всем!!!",author:5,date:"11/10/19",views:28000,answers:18,pinned:false,category:"Полезное",
      posts:[
        {user:5,date:"11/10/19",text:"Демонстрационное видео могло бы быть прикреплено к первому сообщению темы.",likes:17,dislikes:1},
        {user:2,date:"12/10/19",text:"Посмотрел. Для макета достаточно превью и кнопки воспроизведения.",likes:8,dislikes:0}
      ]},
    {id:106,title:"График работы гаранта",author:3,date:"15/08/19",views:170,answers:3,pinned:false,category:"Информация",
      posts:[
        {user:3,date:"15/08/19",text:"Здесь размещается демонстрационный график. Контент можно полностью менять через админ-панель.",likes:6,dislikes:0}
      ]}
  ]
};

function load(){try{return JSON.parse(localStorage.getItem(KEY))||structuredClone(seed)}catch{return structuredClone(seed)}}
let state=load();
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function user(id){return state.users.find(x=>x.id===Number(id))||state.users[0]}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function avatar(u,cls="avatar"){return `<div class="${cls}" style="background:${u.color}">${esc(u.avatar)}</div>`}
function fmt(n){return new Intl.NumberFormat("ru-RU").format(n)}

const modal=document.getElementById("modal"), content=document.getElementById("modalContent");
function openModal(html){content.innerHTML=html;modal.classList.add("open")}
function closeModal(){modal.classList.remove("open")}
document.querySelector(".close").onclick=closeModal;
modal.onclick=e=>{if(e.target===modal)closeModal()};

function profileHTML(id){
  const u=user(id);
  return `<div class="profile-head">${avatar(u,"profile-avatar")}<div><h2>${esc(u.name)}</h2><span class="role">${esc(u.role)}</span><p>${esc(u.status)}</p></div></div>
  <div class="profile-stats"><div><b>${fmt(u.rating)}</b><span>Рейтинг</span></div><div><b>${fmt(u.posts)}</b><span>Сообщений</span></div><div><b>${fmt(u.likes)}</b><span>Лайков</span></div><div><b>${fmt(u.dislikes)}</b><span>Дизлайков</span></div></div>
  <div class="profile-info"><p><b>Регистрация:</b> ${esc(u.joined)}</p><p><b>Роль:</b> ${esc(u.role)}</p></div>
  <button class="gold-btn" onclick="showUserThreads(${u.id})">Темы пользователя</button>`;
}
function showProfile(id){openModal(profileHTML(id))}
window.showUserThreads=function(id){
  const u=user(id); const list=state.threads.filter(t=>t.author===id||t.posts.some(p=>p.user===id));
  openModal(`<h2>Темы и сообщения: ${esc(u.name)}</h2>${list.map(t=>`<div class="modal-list"><div><b>${esc(t.title)}</b><br><small>${fmt(t.views)} просмотров · ${t.answers} ответов</small><br><button class="link-btn" onclick="closeModal();showThread(${t.id})">Открыть тему</button></div></div>`).join("") || "<p>Нет тем.</p>"}`);};
window.showProfile=showProfile;

function showThread(id){
 const t=state.threads.find(x=>x.id===id); if(!t)return;
 t.views++;
 save();
 const posts=t.posts.map((p,i)=>{const u=user(p.user);return `<article class="post"><aside class="post-user" onclick="showProfile(${u.id})">${avatar(u,"post-avatar")}<a>${esc(u.name)}</a><span>${esc(u.role)}</span><small>Рейтинг: ${fmt(u.rating)}</small><small>Сообщений: ${fmt(u.posts)}</small><small>👍 ${fmt(u.likes)} &nbsp; 👎 ${fmt(u.dislikes)}</small></aside><div class="post-body"><div class="post-meta">${esc(p.date)} <span>#${i+1}</span></div><div class="post-text">${esc(p.text).replace(/\n/g,"<br>")}</div><div class="post-actions"><button onclick="vote(${t.id},${i},'like')">👍 ${p.likes}</button><button onclick="vote(${t.id},${i},'dislike')">👎 ${p.dislikes}</button><button onclick="showProfile(${u.id})">Профиль</button></div></div></article>`}).join("");
 openModal(`<div class="thread-modal-head"><div><span class="crumb-mini">${esc(t.category)}</span><h2>${esc(t.title)}</h2><small>${esc(t.date)} · ${fmt(t.views)} просмотров · ${t.answers} ответов</small></div></div><div class="posts">${posts}</div><div class="reply-box"><b>Ответить</b><textarea id="replyText" placeholder="Напишите демонстрационный ответ..."></textarea><button class="gold-btn" onclick="addReply(${t.id})">Отправить ответ</button></div>`);
}
window.showThread=showThread;
window.vote=function(tid,pi,type){const p=state.threads.find(t=>t.id===tid).posts[pi];type==="like"?p.likes++:p.dislikes++;save();showThread(tid)}
window.addReply=function(tid){const v=document.getElementById("replyText").value.trim();if(!v)return;const t=state.threads.find(x=>x.id===tid);t.posts.push({user:1,date:"08/10/26",text:v,likes:0,dislikes:0});t.answers++;save();showThread(tid)}

function renderForum(){
 document.querySelector(".fake-logo").innerHTML=esc(state.site.title);
 document.querySelector(".tagline").textContent=state.site.subtitle;
 document.querySelector("footer").textContent=state.site.footer;
 const host=document.querySelector(".threads:not(.pinned)");
 host.innerHTML=state.threads.filter(t=>!t.pinned).map(threadRow).join("");
 const pin=document.querySelector(".threads.pinned");
 pin.innerHTML=state.threads.filter(t=>t.pinned).map(threadRow).join("");
 bindRows();
}
function threadRow(t){
 const u=user(t.author), tag=t.pinned?'<b>ВАЖНО</b>':(t.category==="Полезное"?'<em>Полезное</em>':"");
 return `<article class="thread" data-id="${t.id}">${avatar(u)}<div class="thread-main"><h3>${tag} ${esc(t.title)}</h3><small>${esc(u.name)} · ${esc(t.date)}</small></div><div class="stats"><span>Ответы: ${fmt(t.answers)}</span><span>Просмотры: ${fmt(t.views)}</span></div><time>${esc(t.date)}</time><div class="mini">${esc(u.avatar)}</div></article>`;
}
function bindRows(){document.querySelectorAll(".thread").forEach(el=>el.onclick=()=>showThread(Number(el.dataset.id)))}
renderForum();

document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",()=>{
 const a=el.dataset.action;
 if(a==="search")openModal(`<h2>Поиск по форуму</h2><input id="searchInput" class="full-input" placeholder="Введите название темы или пользователя"><div id="searchResults"></div>`);
 else if(a==="login")openModal('<h2>Вход</h2><input class="full-input" placeholder="Логин"><input class="full-input" type="password" placeholder="Пароль"><button class="gold-btn">Войти</button>');
 else if(a==="register")openModal('<h2>Регистрация</h2><input class="full-input" placeholder="Имя пользователя"><input class="full-input" type="password" placeholder="Пароль"><button class="gold-btn">Создать аккаунт</button>');
 else if(a==="rules")openModal('<h2>Правила</h2><p>Демонстрационные правила форума. Не публикуйте реальные персональные данные.</p>');
 else if(a==="help")openModal('<h2>Справка</h2><p>Нажмите на тему, чтобы открыть обсуждение. Нажмите на имя автора — чтобы открыть профиль со статистикой.</p>');
 else if(a==="profile")showProfile(1);
 else if(a==="admin")showAdmin();
 else if(a==="home")window.scrollTo({top:0,behavior:"smooth"});
 else if(a==="ad")openModal('<h2>Рекламный блок</h2><p>Кликабельный демонстрационный рекламный слот.</p>');
}));
document.addEventListener("input",e=>{
 if(e.target.id!=="searchInput")return;
 const q=e.target.value.toLowerCase(); const out=document.getElementById("searchResults");
 const ts=state.threads.filter(t=>t.title.toLowerCase().includes(q)||user(t.author).name.toLowerCase().includes(q));
 out.innerHTML=ts.map(t=>`<div class="search-item"><b>${esc(t.title)}</b><small>${esc(user(t.author).name)} · ${t.answers} ответов</small><button onclick="closeModal();showThread(${t.id})">Открыть</button></div>`).join("")||"<p>Ничего не найдено.</p>";
});

window.showAdmin=function(){
 const users=state.users.map(u=>`<tr><td>${u.id}</td><td><input data-u="${u.id}" data-f="name" value="${esc(u.name)}"></td><td><input data-u="${u.id}" data-f="rating" type="number" value="${u.rating}"></td><td><input data-u="${u.id}" data-f="posts" type="number" value="${u.posts}"></td><td><input data-u="${u.id}" data-f="likes" type="number" value="${u.likes}"></td><td><input data-u="${u.id}" data-f="dislikes" type="number" value="${u.dislikes}"></td></tr>`).join("");
 const threads=state.threads.map(t=>`<div class="admin-thread"><input data-t="${t.id}" data-f="title" value="${esc(t.title)}"><textarea data-t="${t.id}" data-f="first">${esc(t.posts[0]?.text||"")}</textarea><div><button onclick="adminOpenThread(${t.id})">Редактировать тему</button><button class="danger" onclick="adminDeleteThread(${t.id})">Удалить</button></div></div>`).join("");
 openModal(`<h2>Админ-панель</h2><div class="admin-tabs"><button onclick="adminSection('site')">Сайт</button><button onclick="adminSection('users')">Пользователи</button><button onclick="adminSection('threads')">Темы</button></div>
 <div id="adminArea"><h3>Редактирование сайта</h3><label>Название<input id="siteTitle" class="full-input" value="${esc(state.site.title)}"></label><label>Подзаголовок<input id="siteSubtitle" class="full-input" value="${esc(state.site.subtitle)}"></label><label>Футер<input id="siteFooter" class="full-input" value="${esc(state.site.footer)}"></label><button class="gold-btn" onclick="adminSaveSite()">Сохранить</button>
 <h3>Быстрый список тем</h3>${threads}</div>`);
};
window.adminSaveSite=function(){state.site.title=document.getElementById("siteTitle").value;state.site.subtitle=document.getElementById("siteSubtitle").value;state.site.footer=document.getElementById("siteFooter").value;save();renderForum();showAdmin();};
window.adminOpenThread=function(id){
 const t=state.threads.find(x=>x.id===id);
 openModal(`<h2>Редактор темы #${id}</h2><label>Заголовок<input id="etitle" class="full-input" value="${esc(t.title)}"></label><label>Категория<input id="ecat" class="full-input" value="${esc(t.category)}"></label><label>Первое сообщение<textarea id="etext" class="full-text">${esc(t.posts[0]?.text||"")}</textarea></label><button class="gold-btn" onclick="adminSaveThread(${id})">Сохранить изменения</button><hr><h3>Все сообщения</h3>${t.posts.map((p,i)=>`<div class="edit-post"><b>${esc(user(p.user).name)}</b><textarea id="p_${id}_${i}" class="full-text">${esc(p.text)}</textarea></div>`).join("")}`);
};
window.adminSaveThread=function(id){
 const t=state.threads.find(x=>x.id===id);t.title=document.getElementById("etitle").value;t.category=document.getElementById("ecat").value;t.posts[0].text=document.getElementById("etext").value;
 t.posts.forEach((p,i)=>{const el=document.getElementById(`p_${id}_${i}`);if(el)p.text=el.value});save();renderForum();showAdmin();
};
window.adminDeleteThread=function(id){if(confirm("Удалить демонстрационную тему?")){state.threads=state.threads.filter(t=>t.id!==id);save();renderForum();showAdmin()}};
window.adminSection=function(kind){
 const area=document.getElementById("adminArea");
 if(kind==="users"){area.innerHTML=`<h3>Пользователи и статистика</h3><div class="table-scroll"><table class="admin-table"><tr><th>ID</th><th>Имя</th><th>Рейтинг</th><th>Сообщения</th><th>Лайки</th><th>Дизлайки</th></tr>${state.users.map(u=>`<tr><td>${u.id}</td><td><input data-u="${u.id}" data-f="name" value="${esc(u.name)}"></td><td><input data-u="${u.id}" data-f="rating" type="number" value="${u.rating}"></td><td><input data-u="${u.id}" data-f="posts" type="number" value="${u.posts}"></td><td><input data-u="${u.id}" data-f="likes" type="number" value="${u.likes}"></td><td><input data-u="${u.id}" data-f="dislikes" type="number" value="${u.dislikes}"></td></tr>`).join("")}</table></div><button class="gold-btn" onclick="adminSaveUsers()">Сохранить пользователей</button>`}
 if(kind==="threads"){area.innerHTML=`<h3>Все страницы / темы</h3>${state.threads.map(t=>`<div class="admin-thread"><input data-t="${t.id}" data-f="title" value="${esc(t.title)}"><div><button onclick="adminOpenThread(${t.id})">Открыть полный редактор</button><button class="danger" onclick="adminDeleteThread(${t.id})">Удалить</button></div></div>`).join("")}<button class="gold-btn" onclick="adminNewThread()">Добавить тему</button>`}
 if(kind==="site")showAdmin();
};
window.adminSaveUsers=function(){document.querySelectorAll("[data-u]").forEach(el=>{const u=user(el.dataset.u),f=el.dataset.f;u[f]=f==="name"?el.value:Number(el.value)});save();renderForum();showAdmin();};
window.adminNewThread=function(){const id=Math.max(...state.threads.map(t=>t.id))+1;state.threads.push({id,title:"Новая демонстрационная тема",author:1,date:"08/10/26",views:0,answers:1,pinned:false,category:"Новая категория",posts:[{user:1,date:"08/10/26",text:"Текст новой демонстрационной темы.",likes:0,dislikes:0}]});save();renderForum();showAdmin();};
