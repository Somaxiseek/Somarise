// 给本地演示服务播一批虚构数据，只为看视觉：空界面看不出设计好坏。
// 想回到新人状态：npm run reset -r
'use strict';
const BASE=process.env.SEED_BASE||'http://127.0.0.1:8787';
const ZONE='Asia/Shanghai';
const TODAY=new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);

async function req(path,method='GET',body,token){
  const r=await fetch(BASE+path,{method,headers:Object.assign({'Content-Type':'application/json'},token?{Authorization:'Bearer '+token}:{}),body:body?JSON.stringify(body):undefined});
  const data=await r.json().catch(()=>({}));
  return {status:r.status,data};
}
function shiftDate(d,n){return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const {data:sess}=await req('/local-session','POST',{userId:'demo-a'});
  const token=sess.token;
  const H=h=>h(token);
  function h(t){return t;}
  const get=p=>req(p,'GET',null,token);
  const post=(p,b)=>req(p,'POST',Object.assign({confirmed:true},b),token);
  const put=(p,b)=>req(p,'PUT',b,token);
  const patch=(p,b)=>req(p,'PATCH',b,token);

  // 1) 目标：心肺 150 分钟/周，抗阻 3 天/周，饮水 2100 ml/天
  for(const g of [{key:'cardio',period:'weekly',target:150},{key:'strength',period:'weekly',target:3},{key:'water',period:'daily',target:2100}]){
    const r=await patch('/goals',g);
    console.log('goal',g.key,r.status,r.status>=400?JSON.stringify(r.data):'');
  }

  // 2) 找项目 id
  const home=(await get('/home')).data;
  const projects=home.habits.projects||[];
  const byName=n=>projects.find(p=>p.name===n);
  console.log('projects:',projects.map(p=>p.name).join(', '));

  const strength=byName('力量训练');
  const running=byName('跑步');

  // 3) 抗阻打卡：过去 9 周，每周 3 天（凑齐周目标的「每周 3 天」）
  const pattern=[];
  for(let w=0;w<9;w++)for(const d of [w*7,w*7+2,w*7+4])pattern.push(d);
  for(const off of pattern){
    const d=shiftDate(TODAY,-off);
    if(d>TODAY)continue;
    const r=await post('/projects/'+strength.id+'/checkins',{date:d,requestId:'seed-s-'+d});
    if(r.status>=400&&r.status!==409)console.log('checkin fail',d,r.status,JSON.stringify(r.data));
  }

  // 4) 心肺：过去 9 周，每周 3 次跑步/骑行，凑够周目标 150 分钟 → 这些周整周闭环
  const runs=[];
  for(let w=0;w<9;w++)runs.push([w*7,['running',60,9000]],[w*7+1,['cycling',55,21000]],[w*7+3,['running',60,9500]]);
  for(const [off,spec] of runs){
    const [type,min,dist]=spec;
    const d=shiftDate(TODAY,-off);
    if(d>TODAY)continue;
    const r=await post('/activities',{type,durationSec:min*60,distanceM:dist,occurredAt:d+'T07:30:00+08:00',timeZone:ZONE,visibility:'private',confirmed:true,requestId:'seed-a-'+d+'-'+type});
    if(r.status>=400)console.log('activity fail',d,type,r.status,JSON.stringify(r.data));
  }

  // 5) 饮水：今天 1500 / 2100 ml，前几天也有记录
  const water=projects.find(p=>p.kind==='hydration'||p.name.indexOf('水')>=0);
  if(water){
    for(const [off,ml] of [[0,600],[0,500],[0,400],[1,2100],[2,1800],[3,2100],[4,1500]]){
      const d=shiftDate(TODAY,-off);
      if(d>TODAY)continue;
      const r=await post('/projects/'+water.id+'/water',{amountMl:ml,date:d,requestId:'seed-w-'+d+'-'+ml});
      if(r.status>=400)console.log('water fail',d,r.status,JSON.stringify(r.data));
    }
  }

  // 6) 体测：近两周体重缓降
  const bodyPlan=[[12,68.9,78],[9,68.5,77.5],[6,68.2,77],[3,67.8,76.5],[0,67.5,76]];
  for(const [off,w,waist] of bodyPlan){
    const d=shiftDate(TODAY,-off);
    if(d>TODAY)continue;
    const r=await put('/body-metrics',{date:d,weightKg:w,waistCm:waist});
    if(r.status>=400)console.log('body fail',d,r.status,JSON.stringify(r.data));
  }

  // 7) 学习：把今天的新词评一遍
  const todayLearn=(await get('/learning/today')).data;
  const fresh=(todayLearn.fresh||[]).map(w=>w.id);
  for(const id of fresh){
    const r=await post('/learning/review',{wordId:id,grade:'good'});
    if(r.status>=400)console.log('review fail',id,r.status,JSON.stringify(r.data));
  }
  console.log('learned today:',fresh.length);

  const after=(await get('/home')).data;
  console.log('day goals:',JSON.stringify(after.goals.day.map(g=>({k:g.key,c:g.current,t:g.target,closed:g.closed}))));
  console.log('week goals:',JSON.stringify(after.goals.week.map(g=>({k:g.key,c:g.current,t:g.target,closed:g.closed}))));
  console.log('recordedToday:',after.goals.recordedToday);
  console.log('achievements:',JSON.stringify(after.habits.achievements));
})().catch(e=>{console.error('fatal',e);process.exit(1);});
