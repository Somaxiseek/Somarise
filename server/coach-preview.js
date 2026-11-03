'use strict';
let token='';let generation=0;
const status=document.getElementById('status'),members=document.getElementById('members');
async function api(path,method='GET'){const r=await fetch(path,{method,headers:{Authorization:'Bearer '+token},cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error||'读取失败');return data;}
function text(tag,value,parent){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
async function refresh(){const run=++generation;members.replaceChildren();if(!token){status.textContent='请先进入虚构教练预览。';return;}try{const [list,invite]=await Promise.all([api('/coach/members'),api('/coach/invite')]);const rows=Array.isArray(list)?list:(list.members||[]);if(run!==generation)return;for(const m of rows){const card=document.createElement('section');text('h2',m.name||m.nickname||'会员',card);text('p','会员本人授权 · 授权于 '+(m.authorizedAt||'').slice(0,10),card);text('p','周期看板在 App 内看（底部 ＋ → 会员周期看板）。',card);members.append(card);}const code=(invite&&invite.code)||'';status.textContent=rows.length?'这里只列名字。本周目标与周/月/季/年闭环在 App 的会员周期看板里。':('还没有会员。把你的教练码 '+code+' 发给学员，TA 在 App 的「我的 → 教练授权」里输入并同意后，就会出现在这里。');}catch(e){if(run===generation){members.replaceChildren();status.textContent=e.message;}}}
document.getElementById('login').onclick=async()=>{try{const r=await api('/local-coach-session','POST');token=r.token;await refresh();}catch(e){status.textContent=e.message;}};
document.getElementById('refresh').onclick=refresh;
// Drop displayed summaries when leaving the page; no browser persistence of health data.
window.addEventListener('pagehide',()=>{generation++;token='';members.replaceChildren();});
