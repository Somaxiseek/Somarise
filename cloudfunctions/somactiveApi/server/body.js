'use strict';
const {randomUUID}=require('node:crypto');
const {fail,day,shift}=require('./domain');

function monday(d){return shift(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));}
// 一位小数的身体测量值；空字符串/undefined/null 视为「这次没测」
function measured(v,min,max,label){
  if(v===undefined||v===null||v==='')return null;
  const n=Number(v);
  if(!Number.isFinite(n)||n<min||n>max||Math.abs(n*10-Math.round(n*10))>1e-6)fail(label+'须为'+min+'–'+max+'，最多一位小数');
  return Math.round(n*10)/10;
}
function avg(list){return list.length?Math.round(list.reduce((a,b)=>a+b,0)/list.length*10)/10:null;}

class Body{
 constructor(service){this.s=service;service.db.body_metrics||=[];}
 get db(){return this.s.db;}
 // 饮水目标始终跟「日期最新的那次体重」走，补录/删除旧记录都不会把目标带偏
 syncWater(uid){
  if(!this.habits)return;
  try{
   const latest=this.db.body_metrics.filter(e=>e.userId===uid).sort((a,b)=>b.date.localeCompare(a.date))[0];
   if(latest&&latest.weightKg!=null)this.habits.syncWeight(uid,latest.weightKg);
  }catch(e){}
 }
 record(uid,input){
  const user=this.s.user(uid),today=day(this.s.clock(),user.timeZone);
  const date=input.date||today;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date>today)fail('测量日期无效或在未来');
  const weightKg=measured(input.weightKg,20,300,'体重');
  const waistCm=measured(input.waistCm,40,200,'腰围');
  if(weightKg==null&&waistCm==null)fail('体重和腰围至少填写一项');
  const old=this.db.body_metrics.find(e=>e.userId===uid&&e.date===date);
  if(old){
   if(weightKg!=null)old.weightKg=weightKg;
   if(waistCm!=null)old.waistCm=waistCm;
   old.updatedAt=this.s.clock();
   this.s.save();
   this.syncWater(uid);
   return old;
  }
  const e={id:randomUUID(),userId:uid,date,weightKg,waistCm,timeZone:user.timeZone,createdAt:this.s.clock(),updatedAt:this.s.clock()};
  this.db.body_metrics.push(e);this.s.save();
  this.syncWater(uid);
  return e;
 }
 // 近 weeks 周（含本周）的周均值：一周内只平均有测量的天，没测的周为 null
 list(uid,weeks=12){
  const user=this.s.user(uid),today=day(this.s.clock(),user.timeZone);
  const count=Math.min(Math.max(Number(weeks)||12,4),52);
  const entries=this.db.body_metrics.filter(e=>e.userId===uid).sort((a,b)=>b.date.localeCompare(a.date));
  const series=[];
  for(let i=count-1;i>=0;i--){
   const start=monday(shift(today,-7*i)),end=shift(start,6);
   const inWeek=entries.filter(e=>e.date>=start&&e.date<=end);
   series.push({start,end,
    label:start.slice(5).replace('-','/')+'起',
    count:inWeek.length,
    weightKg:avg(inWeek.map(e=>e.weightKg).filter(v=>v!=null)),
    waistCm:avg(inWeek.map(e=>e.waistCm).filter(v=>v!=null))});
  }
  const thisWeek=series[series.length-1];
  const trail=Array.from({length:7},(_,i)=>{const date=shift(today,i-6);return {date,measured:entries.some(e=>e.date===date)};});
  return {today,latest:entries[0]||null,
   week:{weightKg:thisWeek.weightKg,waistCm:thisWeek.waistCm,count:thisWeek.count},
   weeks:series,trail,entries:entries.slice(0,30)};
 }
 // 年 → 月 → 周 三级聚合；每级都只平均「有测量的天」，没测记录为 null
 // 周只归属一次，归到该周最早一次记录所在的月份，避免跨月周重复或产生空月
 calendar(uid){
  const user=this.s.user(uid),today=day(this.s.clock(),user.timeZone);
  const entries=this.db.body_metrics.filter(e=>e.userId===uid).sort((a,b)=>b.date.localeCompare(a.date));
  const pack=list=>({count:list.length,
   weightKg:avg(list.map(e=>e.weightKg).filter(v=>v!=null)),
   waistCm:avg(list.map(e=>e.waistCm).filter(v=>v!=null))});
  const yearMap=new Map();
  const bucket=(date)=>{
   const y=date.slice(0,4),m=date.slice(0,7);
   if(!yearMap.has(y))yearMap.set(y,{year:y,entries:[],months:new Map()});
   const yn=yearMap.get(y);
   if(!yn.months.has(m))yn.months.set(m,{month:m,entries:[],weeks:new Map()});
   return {yn,mn:yn.months.get(m)};
  };
  // 月均值按「记录所在月」，同时累加到年
  for(const e of entries){const {yn,mn}=bucket(e.date);yn.entries.push(e);mn.entries.push(e);}
  // 周聚合：先按周一归组，再挂到该周最早记录所在的月份
  const weekMap=new Map();
  for(const e of entries){
   const wStart=monday(e.date);
   if(!weekMap.has(wStart))weekMap.set(wStart,{start:wStart,end:shift(wStart,6),entries:[]});
   weekMap.get(wStart).entries.push(e);
  }
  for(const w of weekMap.values()){
   const earliest=w.entries.reduce((a,b)=>a.date<b.date?a:b);
   bucket(earliest.date).mn.weeks.set(w.start,w);
  }
  const years=[...yearMap.values()].sort((a,b)=>b.year.localeCompare(a.year)).map(yn=>({
   year:yn.year,...pack(yn.entries),
   months:[...yn.months.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(mn=>({
    month:mn.month,label:Number(mn.month.slice(5))+'月',...pack(mn.entries),
    weeks:[...mn.weeks.values()].sort((a,b)=>b.start.localeCompare(a.start)).map(wn=>({
     start:wn.start,end:wn.end,label:wn.start.slice(5).replace('-','/')+' 起',...pack(wn.entries)
    }))
   }))
  }));
  return {...this.list(uid,12),today,years};
 }
 homeSummary(uid){
  const user=this.s.user(uid),today=day(this.s.clock(),user.timeZone);
  const entries=this.db.body_metrics.filter(e=>e.userId===uid).sort((a,b)=>b.date.localeCompare(a.date));
  const start=monday(today);
  const inWeek=entries.filter(e=>e.date>=start&&e.date<=today);
  const previous=entries.filter(e=>e.date>=shift(start,-7)&&e.date<start);
  return {latest:entries[0]||null,
   previousWeek:{weightKg:avg(previous.map(e=>e.weightKg).filter(v=>v!=null)),waistCm:avg(previous.map(e=>e.waistCm).filter(v=>v!=null))},
   week:{weightKg:avg(inWeek.map(e=>e.weightKg).filter(v=>v!=null)),waistCm:avg(inWeek.map(e=>e.waistCm).filter(v=>v!=null)),count:inWeek.length},
   trail:Array.from({length:7},(_,i)=>{const date=shift(today,i-6);return {date,measured:entries.some(e=>e.date===date)};})};
 }
 remove(uid,date){
  this.s.user(uid);
  const i=this.db.body_metrics.findIndex(e=>e.userId===uid&&e.date===date);
  if(i<0)fail('记录不存在',404);
  this.db.body_metrics.splice(i,1);this.s.save();
  this.syncWater(uid);
 }
}
module.exports={Body};
