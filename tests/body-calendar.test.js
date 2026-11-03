const {test}=require('node:test');const assert=require('node:assert/strict');const {createApp}=require('../server/http');

test('body calendar: 年 → 月 → 周 聚合，周只归属一个月份，均值只按有测量的天',async t=>{
 const {server,store}=createApp({memory:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(p,method='GET',body,token)=>{const r=await fetch(base+p,{method,headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 const a=(await request('/local-session','POST',{userId:'demo-a'})).data.token;
 const b=(await request('/local-session','POST',{userId:'demo-b'})).data.token;

 // 跨三个月造数据：注意 10-01 属于「09/28 起的周」，该周应只出现在 9 月
 const plan=[['2026-08-05',75.2,84.0],['2026-08-12',75.0,83.9],
  ['2026-09-03',74.5,83.5],['2026-09-10',74.3,83.4],
  ['2026-10-01',73.6,82.9],['2026-10-26',72.5,82.4],['2026-10-27',72.4,82.3]];
 for(const [date,weightKg,waistCm] of plan){
  assert.equal((await request('/body-metrics','PUT',{date,weightKg,waistCm},a)).status,200);
 }

 const cal=(await request('/body-metrics/calendar','GET',null,a)).data;
 assert.ok(Array.isArray(cal.years));
 const y2026=cal.years.find(y=>y.year==='2026');
 assert.ok(y2026,'应存在 2026 年');
 assert.equal(y2026.count,7,'年记录数应为 7 天');
 // 年均值 = 全部 7 天的平均
 const wAvg=Math.round((75.2+75.0+74.5+74.3+73.6+72.5+72.4)/7*10)/10;
 assert.equal(y2026.weightKg,wAvg);

 const aug=y2026.months.find(m=>m.month==='2026-08');
 const sep=y2026.months.find(m=>m.month==='2026-09');
 const oct=y2026.months.find(m=>m.month==='2026-10');
 assert.ok(aug&&sep&&oct,'应有 8/9/10 三个月');
 assert.equal(oct.count,3,'10 月记录 3 天');

 // 09/28 起的那周只有 10-01 一条记录 → 归 10 月（周只归属它最早一次记录所在的月份）
 const sepWeeks=sep.weeks.map(w=>w.start);
 assert.deepEqual(sepWeeks,['2026-09-07','2026-08-31'],'9 月应只有 09/07、08/31 两周（倒序）');
 const octWeeks=oct.weeks.map(w=>w.start);
 assert.deepEqual(octWeeks,['2026-10-26','2026-09-28'],'10 月周按起始日倒序');

 // 本周（10/26 起）两天测量 → 周均值 = (72.5+72.4)/2
 const thisWeek=oct.weeks.find(w=>w.start==='2026-10-26');
 assert.equal(thisWeek.count,2);
 assert.equal(thisWeek.weightKg,72.5);
 assert.equal(thisWeek.waistCm,82.4);

 // 月份均值只按该月有测量的天
 assert.equal(oct.count,3,'10 月记录 3 天');
 assert.equal(oct.weightKg,Math.round((73.6+72.5+72.4)/3*10)/10);

 // 每年份内的周起始日不得重复（唯一归属）
 const seen=new Set();
 for(const y of cal.years)for(const m of y.months)for(const w of m.weeks){
  const key=y.year+'|'+w.start;
  assert.ok(!seen.has(key),'同一周重复出现：'+key);
  seen.add(key);
 }

 // 所有权隔离：demo-b 看不到 demo-a 的数据
 const other=(await request('/body-metrics/calendar','GET',null,b)).data;
 assert.equal(other.years.length,0,'他人不应看到别人测量的聚合');
});
