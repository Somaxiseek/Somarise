const {test}=require('node:test');const assert=require('node:assert/strict');const {createApp}=require('../server/http');
// 与 server/body.js 一致的周分组逻辑（周一为周起点），让断言不随「今天周几」波动
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const mondayOf=d=>shift(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));
test('body metrics: daily upsert, weekly average over measured days only, ownership, home summary',async t=>{
 const {server,store}=createApp({memory:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(p,method='GET',body,token)=>{const r=await fetch(base+p,{method,headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 const a=(await request('/local-session','POST',{userId:'demo-a'})).data.token;
 const b=(await request('/local-session','POST',{userId:'demo-b'})).data.token;

 // 未来日期拒绝；至少一项
 assert.equal((await request('/body-metrics','PUT',{date:'2999-01-01',weightKg:70},a)).status,400);
 assert.equal((await request('/body-metrics','PUT',{date:'2999-01-01'},a)).status,400);
 assert.equal((await request('/body-metrics','PUT',{},a)).status,400);
 assert.equal((await request('/body-metrics','PUT',{weightKg:15},a)).status,400);
 assert.equal((await request('/body-metrics','PUT',{weightKg:'abc'},a)).status,400);

 // 记录今天与昨天：同一天重复保存即更新（upsert）
 const today=(await request('/body-metrics','GET',null,a)).data.today;
 const first=await request('/body-metrics','PUT',{date:today,weightKg:72.5,waistCm:82.4},a);
 assert.equal(first.status,200);
 const again=await request('/body-metrics','PUT',{date:today,weightKg:72.3},a);
 assert.equal(again.status,200);
 assert.equal(again.data.weightKg,72.3);
 assert.equal(again.data.waistCm,82.4,'未填的腰围应保留原值');

 const yest=shift(today,-1);
 await request('/body-metrics','PUT',{date:yest,weightKg:73.1},a);
 // 当前周（周一为起点）均值：今天(72.3)与昨天(73.1)是否落在同一周，决定均值
 const wkStart=mondayOf(today);
 const inWeek = yest>=wkStart;
 const expectedW = inWeek ? Math.round((72.3+73.1)/2*10)/10 : 72.3;
 const expectedCount = inWeek ? 2 : 1;
 const list=(await request('/body-metrics','GET',null,a)).data;
 const cur=list.weeks[list.weeks.length-1];
 assert.equal(cur.weightKg,expectedW);
 assert.equal(cur.count,expectedCount);
 assert.equal(list.latest.date,today);

 // ownership：demo-b 看不到 demo-a 的记录
 const listB=(await request('/body-metrics','GET',null,b)).data;
 assert.equal(listB.entries.length,0);
 assert.equal((await request('/body-metrics/'+today,'DELETE',{},b)).status,404);

 // /home 摘要：最新值 + 本周均值 + 近7天测量点
 const home=(await request('/home','GET',null,a)).data;
 assert.equal(home.body.latest.weightKg,72.3);
 assert.equal(home.body.week.weightKg,expectedW);
 assert.equal(home.body.trail.length,7);
 assert.ok(home.body.trail.some(d=>d.measured));

 // 删除后重算
 const del=await request('/body-metrics/'+yest,'DELETE',{},a);
 assert.equal(del.status,200);
 const list2=(await request('/body-metrics','GET',null,a)).data;
 assert.equal(list2.weeks[list2.weeks.length-1].weightKg,72.3);

 // 饮水目标跟随体重：默认健康档 37.5ml/kg，体重 72.3 → 目标 = round(72.3×37.5)
 const homeA=(await request('/home','GET',null,a)).data;
 const waterProj=homeA.habits.projects.find(p=>p.kind==='hydration');
 assert.equal(waterProj.water.targetMl,Math.round(72.3*35),'没显式设过目标时，建议量按 体重×系数(35) 自动更新');
 assert.equal(waterProj.hydration.weightKg,72.3);
 // 难度整套已取消：改难度不再动饮水目标
 await request('/profile','PATCH',{nickname:'小林',timeZone:'Asia/Shanghai',difficulty:'easy'},a);
 const homeEasy=(await request('/home','GET',null,a)).data;
 assert.equal(homeEasy.habits.projects.find(p=>p.id===waterProj.id).water.targetMl,Math.round(72.3*35),'难度已取消：PATCH difficulty 不再动饮水目标');
 // 把系数改成 40ml/kg，再把今天体重改成 59 → 59×40 = 2360
 await request('/projects/'+waterProj.id,'PUT',{hydration:{weightKg:72.3,coefficient:40}},a);
 await request('/body-metrics','PUT',{date:today,weightKg:59},a);
 const homeB=(await request('/home','GET',null,a)).data;
 assert.equal(homeB.habits.projects.find(p=>p.id===waterProj.id).water.targetMl,59*40,'59kg × 40ml/kg = 2360');
 assert.equal(homeB.body.latest.weightKg,59);
});
