// 体测趋势的时间窗口：近 1 月（每周）/ 近 1 年、3 年（每月）/ 近 5 年（每季度）
// 日历接口已经给出年 → 月 → 周的聚合值，这里只负责按窗口重新组装成一条连续曲线。
// 没有测量的时间点保留 null，曲线会断开，不会被错误地连成一条直线。
'use strict';

const RANGES=[
  {id:'1m',label:'近 1 月'},
  {id:'1y',label:'近 1 年'},
  {id:'3y',label:'近 3 年'},
  {id:'5y',label:'近 5 年'}
];

function shift(d,n){return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
function monday(d){const off=(new Date(d+'T12:00:00Z').getUTCDay()+6)%7;return shift(d,-off);}
function addMonths(key,n){
  let y=Number(key.slice(0,4)),m=Number(key.slice(5,7))+n;
  y+=Math.floor((m-1)/12);m=((m-1)%12+12)%12+1;
  return y+'-'+String(m).padStart(2,'0');
}
function avg(list){
  if(!list.length)return null;
  return Math.round(list.reduce((a,b)=>a+b,0)/list.length*10)/10;
}

function index(years){
  const byMonth=new Map(),byWeek=new Map();
  for(const y of years||[]){
    for(const m of y.months||[]){
      byMonth.set(m.month,{weightKg:m.weightKg==null?null:m.weightKg,waistCm:m.waistCm==null?null:m.waistCm,count:m.count||0});
      for(const w of m.weeks||[])byWeek.set(w.start,{weightKg:w.weightKg==null?null:w.weightKg,waistCm:w.waistCm==null?null:w.waistCm,count:w.count||0});
    }
  }
  return {byMonth,byWeek};
}

// 依当前区间生成曲线点（从旧到新，和读图习惯一致）
function buildSeries(years,today,range){
  const {byMonth,byWeek}=index(years);
  const cur=(today||shift(new Date().toISOString().slice(0,10),0)).slice(0,7);
  const points=[];

  if(range==='1m'){
    // 覆盖最近 30 天：按周一起点分桶，所以是 30 天前那一周 + 本周，通常 6 个点
    const first=monday(shift(today,-30)),last=monday(today);
    for(let start=first;start<=last;start=shift(start,7)){
      const v=byWeek.get(start)||{};
      points.push({key:start,label:start.slice(5).replace('-','/'),weightKg:v.weightKg==null?null:v.weightKg,waistCm:v.waistCm==null?null:v.waistCm});
    }
    return pack(points,'近 1 月 · 每周均值');
  }

  if(range==='1y'||range==='3y'){
    const n=range==='1y'?12:36;
    for(let i=n-1;i>=0;i--){
      const key=addMonths(cur,-i),v=byMonth.get(key)||{};
      const month=Number(key.slice(5,7));
      const label=range==='1y'?(month===1?key.slice(2,4)+'/01':month+'月'):key.slice(2,4)+'/'+String(month).padStart(2,'0');
      points.push({key,label,weightKg:v.weightKg==null?null:v.weightKg,waistCm:v.waistCm==null?null:v.waistCm});
    }
    return pack(points,'近 '+(range==='1y'?'1':n/12)+' 年 · 每月均值');
  }

  // 近 5 年按季度，20 个点足够看清长期走向，又不会挤在一起
  const curQ=Math.floor((Number(cur.slice(5,7))-1)/3);
  const curQFirst=cur.slice(0,4)+'-'+String(curQ*3+1).padStart(2,'0');
  for(let i=19;i>=0;i--){
    const first=addMonths(curQFirst,-3*i);
    const keys=[0,1,2].map(k=>addMonths(first,k));
    const months=keys.map(k=>byMonth.get(k)).filter(Boolean);
    const weights=months.map(m=>m.weightKg).filter(v=>v!=null);
    const waists=months.map(m=>m.waistCm).filter(v=>v!=null);
    points.push({
      key:first,
      label:first.slice(2,4)+'Q'+(Math.floor((Number(first.slice(5,7))-1)/3)+1),
      weightKg:avg(weights),
      waistCm:avg(waists)
    });
  }
  return pack(points,'近 5 年 · 每季度均值');
}

function pack(points,scope){
  const empty=!points.some(p=>p.weightKg!=null||p.waistCm!=null);
  const measured=points.filter(p=>p.weightKg!=null||p.waistCm!=null).length;
  return {points,scope,empty,measured};
}

// 默认落在「能装下全部记录、但不过度留白」的档位
function defaultRange(years,today){
  const months=[];
  if(!today)return '1y';
  for(const y of years||[])for(const m of y.months||[])months.push(m.month);
  if(!months.length)return '1y';
  months.sort();
  const first=months[0];
  let span=(Number(today.slice(0,4))-Number(first.slice(0,4)))*12+(Number(today.slice(5,7))-Number(first.slice(5,7)))+1;
  if(span<=2)return '1m';
  if(span<=15)return '1y';
  if(span<=40)return '3y';
  return '5y';
}

module.exports={RANGES,addMonths,monday,buildSeries,defaultRange};
