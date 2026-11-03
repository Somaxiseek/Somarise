// 今日战报 + 分享卡：全部用服务端算好的目标进度（home.goals），
// 不再自己算「今日闭环」，也不再出现「每天三件事」这种统一完成率。
'use strict';
const MONTHS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const WEEKDAYS=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
const WEEKDAYS_EN=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

function itemsOf(home){
  const g=(home&&home.goals)||null;
  return [].concat((g&&g.day)||[],(g&&g.week)||[]);
}

function todayReport(home){
  const g=(home&&home.goals)||{};
  const today=g.today||'';
  const items=itemsOf(home);
  const dayCount=((g&&g.day)||[]).length;
  const lines=items.map(i=>({
    label:i.label,unit:i.unit,color:i.color,period:i.periodLabel,
    current:i.current,target:i.target,recordOnly:!!i.recordOnly,
    text:i.periodLabel+' '+i.valueText,
    met:!!i.closed,percent:i.percent
  }));
  const recorded=Number(g.recordedToday)||0;
  const day=today.slice(5).replace('-','/');
  const headline=recorded?('今日已记录 '+recorded+' 项'):'今天还没有记录';
  const cardio=items.find(i=>i.key==='cardio');
  const tail=cardio?(' · 心肺 '+cardio.valueText+'（本周）'):'';
  const title=recorded?(day+' '+headline+tail):(day+' · 今天还没有记录');
  return {today,day,recorded,lines,dayCount,headline,title,items,
    finished:lines.filter(l=>l.met).length,
    allMet:false};
}

// 分享图：Somarise 字标 → 英文日期（带星期，日号就在这一行里）→ 今日三圈 →
// 首页那条随机语录 → 底部分项数据。不再有「今天记了几项」那句总结，也不再有大日号：
// 数字进了日期行，中间那块让给圆环（2026-10-29 定稿）。
function shareCard(r,quote){
  if(!r||!r.today)return null;
  const [y,m,d]=r.today.split('-');
  const dow=new Date(r.today+'T12:00:00Z').getUTCDay();
  const weekday=WEEKDAYS[dow];
  const weekdayEn=WEEKDAYS_EN[dow];
  // 每项都带上周期，避免「日目标和周目标混着看」
  const flat=(r.lines||[]).map(l=>({text:l.label+' · '+l.text,color:l.color}));
  // 圆环只取今日组（周目标在下面用文字说），口径与首页 rings 组件完全一致：
  // 同样的 percent / color / soft，绘制时同样走 arcs.js 的环宽、间距和轨道色
  const rings=(r.lines||[]).slice(0,Number(r.dayCount)||0)
    .filter(l=>!l.recordOnly)
    .map(l=>({percent:l.percent,color:l.color,soft:!!l.recordOnly}));
  return {
    date:r.today,
    monthEn:MONTHS[Number(m)-1]||'',
    year:y,
    weekday,
    weekdayEn,
    dateEn:(MONTHS[Number(m)-1]||'')+' '+Number(d)+', '+y+' · '+weekdayEn,
    quote:String(quote||''),
    rings,
    facts:flat,
    factsText:flat.map(f=>f.text).join(' · ')||'今天还没有记录',
    basisLine:'',
    groups:shareGroups(r),
    summary:(r.items.find(i=>i.key==='move')?.details||[]).join('；')||'今天还没有运动记录'
  };
}

function shareGroups(r){
 const day=r.items.slice(0,r.dayCount),week=r.items.slice(r.dayCount);
 const colors={move:'#DF7A77',water:'#06B6D4',english:'#A659C5',cardio:'#D93B36',strength:'#7391D9'};
 const group=(keys,items)=>keys.map(key=>{const i=items.find(x=>x.key===key);return i?{...i,percent:i.recordOnly?(i.done||i.current>0?100:0):i.percent}:{key,label:{move:'运动',water:'饮水',english:'英语',cardio:'心肺',strength:'抗阻'}[key],color:colors[key],percent:0,valueText:'未设置',recordOnly:true};});
 return [{title:'今日记录',items:group(['move','water','english'],day)},{title:'本周进度',items:group(['cardio','strength','water'],week)}];
}
module.exports={shareGroups,todayReport,shareCard,MONTHS,WEEKDAYS,WEEKDAYS_EN};
