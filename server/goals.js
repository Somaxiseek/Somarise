'use strict';
// 目标与达标：每个类别一份独立设置，互不影响。
//   心肺 = 每周累计运动分钟（跑步/骑行/游泳/爬坡等都往里加，不再按距离门槛过滤）
//   抗阻 = 每周训练天数（同一天记几次都只算 1 天）
//   饮水 = 每日毫升数（分次累加，可纠正当日总量）
//   英语 = 每日完成词数（学完自动记录，不能手点伪造）
//   自建 = 用户自己选指标（次数 / 时长 / 数值）与周期
// 目标历史按「周期起点」解析：算某一周/某一天时，用那个周期起点时生效的目标，
// 所以改目标不会追溯改写过去的标准。没有目标 = 仅记录，不算达标也不算失败。
const {randomUUID}=require('node:crypto');
const {fail,day,shift}=require('./domain');
const {monday,CARDIO_TYPES}=require('../miniprogram/utils/guidelines');
const {RULES}=require('../miniprogram/utils/sports');
// 色值和前端同一套（utils/tokens.js），改一处两边都对
const {TOKENS,weekColor}=require('../miniprogram/utils/tokens');
const {estimate}=require('../miniprogram/utils/hydration');

// 内置四项：心肺/抗阻是周目标，饮水/英语是日目标。
// 周环第三圈 = 饮水的「本周达标天数」（waterWeekItem 衍生圈，见下）：
// 新人引导选的三项（有氧 / 抗阻 / 饮水）在环里各有一圈，不用另造目标项。
const BUILTIN=['cardio','strength','water','english'];
const LABEL={cardio:'心肺',strength:'抗阻',water:'饮水',english:'英语'};
const PERIOD={cardio:'weekly',strength:'weekly',water:'daily',english:'daily'};
const METRIC={cardio:'minutes',strength:'days',water:'ml',english:'words'};
const UNIT={minutes:'分钟',days:'天',ml:'ml',words:'词',count:'次',duration:'分钟',value:''};
const COLOR={cardio:TOKENS.cardio,strength:TOKENS.strength,water:TOKENS.water,english:TOKENS.english};
const PART_LABEL={upper:'上肢',lower:'下肢',full:'全身'};
// 建立习惯用的起点值，不是健康指南标准：文案里不许说「达到 WHO 标准」
const PRESET={cardio:[60,90,150],strength:[2,3],water:[1500,1800,2100],english:[3,5,10]};
const MAX_TARGET={minutes:3000,days:7,ml:10000,words:50,count:1000,duration:3000,value:1000000};
const CUSTOM_METRICS=['count','duration','value'];
const MAX_WEEKS=520,MAX_DAYS=730;

class Goals{
  constructor(service,habits,learning){
    this.s=service;this.h=habits;this.l=learning;
    if(!this.s.db.goals)this.s.db.goals=[];
  }
  get db(){return this.s.db;}
  zone(uid){return this.s.user(uid).timeZone||'Asia/Shanghai';}
  today(uid){return day(this.s.clock(),this.zone(uid));}

  // ── 周期：日 = 用户选定时区的那一天；周 = 该时区的周一到周日；
  //    月 = 自然月；年 = 自然年。连续 / 限期没有固定周期起点，见 streakRange / 目标行上的起止。──
  range(period,date){
    if(period==='weekly')return {start:monday(date),end:shift(monday(date),6)};
    if(period==='monthly'){const start=date.slice(0,7)+'-01';const [y,m]=date.split('-').map(Number);
      return {start,end:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};}
    if(period==='yearly')return {start:date.slice(0,4)+'-01-01',end:date.slice(0,4)+'-12-31'};
    return {start:date,end:date};
  }
  nextStart(period,date){
    if(period==='weekly')return shift(monday(date),7);
    if(period==='monthly'){const [y,m]=date.split('-').map(Number);return new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);}
    if(period==='yearly')return (Number(date.slice(0,4))+1)+'-01-01';
    return shift(date,1);
  }
  // 自建目标的全部可选周期（与 habits.goal() 一致）
  CUSTOM_PERIODS=['daily','weekly','monthly','yearly','streak','window'];
  periodLabelOf(period){return {daily:'今日',weekly:'本周',monthly:'本月',yearly:'今年',streak:'连续',window:'期限内'}[period]||'本周';}
  // 「连续」目标没有周期起点：从今天往回数连续有记录的天，走到断为止（就是当前这一段）。
  // 上限 365 步防止极端数据拖死；item() 用这段的起止算 current。
  streakStart(uid,key,today){
    let d=today;
    for(let i=0;i<365&&this.hasRecordOn(uid,key,d);i++)d=shift(d,-1);
    return shift(d,1);
  }

  // ── 目标行 ──
  rowsOf(uid,key){
    return (this.db.goals||[]).filter(g=>g.userId===uid&&g.key===key)
      .sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
  // 某个周期起点生效的那条目标（历史周期按当时的目标算）
  effective(uid,key,periodStart){
    let row=null;
    for(const g of (this.db.goals||[])){
      if(g.userId!==uid||g.key!==key)continue;
      if(g.effectiveFrom>periodStart)continue;
      if(!row||g.effectiveFrom>=row.effectiveFrom)row=g;
    }
    return row;
  }
  // 当前正在用的那条（用于设置页显示，含「下周期生效」的排队目标）
  current(uid,key){
    const rows=this.rowsOf(uid,key),today=this.today(uid);
    let row=null;
    for(const g of rows)if(g.effectiveFrom<=today&&(!row||g.effectiveFrom>=row.effectiveFrom))row=g;
    const pending=rows.filter(g=>g.effectiveFrom>today).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom))[0]||null;
    return {goal:row,pending};
  }

  labelOf(uid,key){
    if(LABEL[key])return LABEL[key];
    const id=key.indexOf('cat:')===0?key.slice(4):null;
    if(!id)return '习惯';
    const c=(this.db.categories||[]).find(c=>c.id===id&&c.userId===uid);
    return c?c.name:'习惯';
  }
  periodFor(uid,key){
    if(PERIOD[key])return PERIOD[key];
    const g=this.current(uid,key).goal;
    return g&&this.CUSTOM_PERIODS.indexOf(g.period)>=0?g.period:'weekly';
  }
  // 用户级颜色覆盖：ringColors[key] 优先，没有就回退默认色。
  // 默认色由 tokens 决定（含水周环的同色相浅版），覆盖只影响用户真正改过的那几项。
  colorFor(uid,key,fallback){
    const u=this.s.user(uid);
    const map=u&&u.ringColors;
    const v=map&&map[key];
    const HEX=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    if(typeof v==='string'&&HEX.test(v))return v.toUpperCase();
    return fallback;
  }
  // 用户在记哪些项：设过目标，或已经有过该类记录
  enabled(uid,key){
    if((this.db.goals||[]).some(g=>g.userId===uid&&g.key===key))return true;
    if(key==='cardio')return (this.db.activities||[]).some(a=>a.userId===uid&&CARDIO_TYPES.indexOf(a.type)>=0);
    if(key==='strength')return (this.db.projects||[]).some(p=>p.userId===uid&&p.kind==='resistance');
    if(key==='water')return (this.db.projects||[]).some(p=>p.userId===uid&&p.kind==='hydration');
    if(key==='english')return (this.db.word_cards||[]).some(c=>c.userId===uid)
      ||(this.db.projects||[]).some(p=>p.userId===uid&&p.kind==='learning');
    return false;
  }
  keysOf(uid){
    const keys=[];
    for(const k of BUILTIN)if(this.enabled(uid,k))keys.push(k);
    for(const c of (this.db.categories||[])){
      if(c.userId!==uid)continue;
      if(['心肺训练','抗阻训练','饮水','英文学习'].indexOf(c.name)>=0)continue;
      const key='cat:'+c.id;
      if((this.db.goals||[]).some(g=>g.userId===uid&&g.key===key)){keys.push(key);continue;}
      const hasRecord=(this.db.projects||[]).some(p=>p.userId===uid&&p.categoryId===c.id
        &&(this.db.checkins||[]).some(x=>x.projectId===p.id));
      if(hasRecord)keys.push(key);
    }
    return keys;
  }

  // ── 各类别的实际量 ──
  // 有氧分钟按强度折算：中等 1 倍、高强 2 倍、散步（低强）0 倍。
  // 这样「每周 150 分钟中等」和「每周 75 分钟高强度」是同一个数：75×2=150，
  // 混着来也成立（60 中等 + 45 高强 = 60+90 = 150）。口径只有这一处。
  cardioMinutes(uid,start,end){
    const tz=this.zone(uid);let sec=0;
    for(const a of (this.db.activities||[])){
      if(a.userId!==uid||CARDIO_TYPES.indexOf(a.type)<0)continue;
      const d=day(a.occurredAt,tz);
      if(d<start||d>end)continue;
      const w=a.intensity==='vigorous'?2:(a.intensity==='low'?0:1);
      sec+=Math.max(0,Number(a.durationSec)||0)*w;
    }
    return Math.round(sec/60);
  }
  // 同一天记几次都只算一个训练日
  strengthDays(uid,start,end){
    const ids=new Set((this.db.projects||[]).filter(p=>p.userId===uid&&p.kind==='resistance').map(p=>p.id));
    const days=new Set();
    for(const c of (this.db.checkins||[])){
      if(c.userId!==uid||!ids.has(c.projectId))continue;
      if(c.date<start||c.date>end)continue;
      days.add(c.date);
    }
    return days.size;
  }
  waterMl(uid,date){
    let ml=0;
    for(const e of (this.db.water_entries||[]))if(e.userId===uid&&e.date===date)ml+=Number(e.amountMl)||0;
    return ml;
  }
  englishWords(uid,date){
    const ids=new Set();
    for(const c of (this.db.word_cards||[]))if(c.userId===uid&&c.lastAt===date)ids.add(c.wordId);
    return ids.size;
  }
  customValue(uid,catId,start,end,metric){
    const ids=new Set((this.db.projects||[]).filter(p=>p.userId===uid&&p.categoryId===catId).map(p=>p.id));
    const list=(this.db.checkins||[]).filter(c=>c.userId===uid&&ids.has(c.projectId)&&c.date>=start&&c.date<=end);
    if(metric==='duration'||metric==='value')return list.reduce((n,c)=>n+(Number(c.amount)||0),0);
    return new Set(list.map(c=>c.date)).size;
  }
  amountOf(uid,key,start,end,metric){
    if(key==='cardio')return this.cardioMinutes(uid,start,end);
    if(key==='strength')return this.strengthDays(uid,start,end);
    if(key==='water')return this.waterMl(uid,start);
    if(key==='english')return this.englishWords(uid,start);
    if(key.indexOf('cat:')===0)return this.customValue(uid,key.slice(4),start,end,metric);
    return 0;
  }

  // ── 本周 vs 上周：分享卡的「比上周多 20 分钟」取这里 ──
  // 讲变化不讲连续，所以这里给的是差值，不是「你落后了」。
  weekCompare(uid){
    const today=this.today(uid),span=this.range('weekly',today);
    const now=this.cardioMinutes(uid,span.start,span.end);
    const prev=this.cardioMinutes(uid,shift(span.start,-7),shift(span.end,-7));
    return {start:span.start,end:span.end,minutes:now,prevMinutes:prev,delta:now-prev,hasPrev:prev>0};
  }

  // ── 档案馆：按天分组的流水 + 「上次怎么记的」 ──
  // 首页讲今天，这里讲过去：能往回翻，不是又一张表单。
  // 圆点色跟圆环同源（心肺正红 / 抗阻靛蓝），同一件事在两处颜色一致。
  clockAt(iso,tz){
    try{
      return new Intl.DateTimeFormat('zh-CN',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false})
        .format(new Date(iso));
    }catch(e){return String(iso||'').slice(11,16);}
  }
  dayLabel(date,today){
    if(date===today)return '今天';
    if(date===shift(today,-1))return '昨天';
    const w=['周日','周一','周二','周三','周四','周五','周六'][new Date(date+'T00:00:00Z').getUTCDay()];
    return date.slice(5).replace('-','/')+' '+w;
  }
  // days：只看最近 N 天（含今天）。0 / 不传 = 全部。
  // 窗口在服务端切，客户端的「最近 3 天 / 7 天」就是同一个口径，
  // 不用再把全部流水拉下来在本地筛（换窗口时也是重新问一次，数字不会各说各话）。
  logbook(uid,limit=60,days=0){
    const tz=this.zone(uid),today=this.today(uid);
    const items=[];
    for(const a of (this.db.activities||[])){
      if(a.userId!==uid||CARDIO_TYPES.indexOf(a.type)<0)continue;
      const rule=RULES[a.type]||{},bits=[];
      if(Number(a.distanceM)>0)bits.push(Math.round(a.distanceM/100)/10+' km');
      if(Number(a.durationSec)>0)bits.push(Math.round(a.durationSec/60)+' 分');
      if(a.intensity==='low')bits.push('不计训练量');
      items.push({
        id:a.id,kind:'cardio',date:day(a.occurredAt,tz),at:a.occurredAt,projectId:a.projectId||'',
        title:rule.label||'运动',meta:bits.join(' · '),time:this.clockAt(a.occurredAt,tz),
        dot:COLOR.cardio,soft:a.intensity==='low',
        // 横滑「再来一次」要原样重放这一笔，所以把录入的原始字段一起带上，
        // 客户端不用再从 meta 字符串里反解析（那是给人看的，不是给代码看的）
        type:a.type,durationSec:Number(a.durationSec)||0,
        distanceM:Number(a.distanceM)||0,intensity:a.intensity||'moderate'
      });
    }
    for(const c of (this.db.checkins||[])){
      if(c.userId!==uid)continue;
      const p=(this.db.projects||[]).find(x=>x.id===c.projectId&&x.userId===uid);
      if(!p||p.kind!=='resistance')continue;
      const bits=[];
      if(PART_LABEL[c.part])bits.push(PART_LABEL[c.part]);
      if(Number(c.amount)>0)bits.push(c.amount+' 次');
      const at=c.createdAt||(c.date+'T12:00:00Z');
      items.push({
        id:c.id,kind:'strength',date:c.date,at,projectId:p.id,
        title:p.name,meta:bits.join(' · '),time:this.clockAt(at,tz),
        dot:COLOR.strength,soft:false,
        // 同上：重放要部位，不靠 meta 反解析
        part:c.part||''
      });
    }
    // 排序键用「日期 + 时间」，不能用 createdAt：抗阻打卡的 createdAt 是录入时刻，
    // 补记昨天的话，createdAt 比日期新，按它排会把同一天的记录拆成两组。
    items.sort((a,b)=>String(b.date+' '+b.time).localeCompare(String(a.date+' '+a.time)));
    // 窗口起点：最近 3 天 = 今天、昨天、前天（不是「今天往前推 3 天」）
    const window=Number(days)>0?Math.min(366,Math.floor(Number(days))):0;
    const from=window?shift(today,-(window-1)):'';
    const scoped=from?items.filter(it=>it.date>=from&&it.date<=today):items;
    const shown=scoped.slice(0,Math.max(1,limit));
    const byDate=new Map();
    for(const it of shown){
      if(!byDate.has(it.date))byDate.set(it.date,[]);
      byDate.get(it.date).push(it);
    }
    const groups=[...byDate.entries()]
      .sort((a,b)=>b[0].localeCompare(a[0]))
      .map(([date,list])=>({date,label:this.dayLabel(date,today),items:list}));
    return {
      today,todayCount:items.filter(i=>i.date===today).length,
      // total = 这个窗口里有几笔；anyTotal = 全部有几笔（用来区分「这几天没记」和「一条都还没记」）
      total:scoped.length,anyTotal:items.length,days:window,from,
      groups
    };
  }

  // ── 一条进度（首页圆环、详情弹层、分享卡共用同一份数字） ──
  item(uid,key,period,periodStart,periodEnd){
    // 连续 / 限期的目标行 effectiveFrom 锚在「今天」，按周期起点查会落空：
    // 这两种周期用今天解析生效目标，起止由目标行（限期）或连续段（连续）决定。
    const _today=this.today(uid);
    const g=this.effective(uid,key,(period==='streak'||period==='window')?_today:periodStart);
    if(period==='window'&&g&&g.startDate){periodStart=g.startDate;periodEnd=g.endDate||periodEnd;}
    if(period==='streak'){periodStart=this.streakStart(uid,key,_today);periodEnd=_today;}
    const metric=(g&&g.metric)||(BUILTIN.indexOf(key)>=0?METRIC[key]:'count');
    const unit=key==='cardio'?'等效分钟':(UNIT[metric]||'');
    const current=this.amountOf(uid,key,periodStart,periodEnd,metric);
    // 没有目标 = 仅记录：显示累计量，不算达标也不算失败。
    // 圆环上「记过就划满这一圈」（只是浅一圈，表示记过了，不是达标）。
    const recordOnly=!g||g.recordOnly===true||!(Number(g.target)>0);
    const target=recordOnly?0:Number(g.target);
    const closed=!recordOnly&&current>=target;
    const done=recordOnly?current>0:closed;
    const percent=recordOnly?0:(target?Math.min(100,Math.round(current/target*100)):0);
    const num=v=>v+(unit?' '+unit:'');
    const left=Math.max(0,target-current);
    // 上一周期做了多少：只在「这一周期还一条都没记」时才查这一次。
    // 用来把那句「还差 X」换成「昨天 25 分钟」——同一个位置，把欠账换成底气。
    // 连续 / 限期没有「上一周期」可言，不查。
    let prev=0;
    if(!recordOnly&&!closed&&current<=0&&(period==='daily'||period==='weekly'||period==='monthly'||period==='yearly')){
      const ps=period==='weekly'?shift(periodStart,-7):period==='monthly'?shift(periodStart,-1).slice(0,8)+'01':period==='yearly'?shift(periodStart,-365):shift(periodStart,-1);
      const pe=period==='weekly'?shift(periodEnd,-7):period==='monthly'?shift(periodStart,-1):period==='yearly'?shift(periodEnd,-365):shift(periodStart,-1);
      prev=this.amountOf(uid,key,ps,pe,metric);
    }
    // 小字那行四档口径：
    //   没开始 → 说上一周期做过什么，不报欠账
    //   有进展但没过半 → 平淡地说还差多少（这时候它是导航，不是催）
    //   过半 → 换成「再来 X 就到了」，周目标再带上还剩几天
    //   达标 → 已达标 ✓
    // 「还差」不删只降级：这行空着会让卡片高度跳，日/周切换时画面会抖一下。
    let remainText,noteTone;
    if(recordOnly){ remainText=done?'已记录 ✓':'记一次就算'; noteTone=done?'ok':'muted'; }
    else if(closed){ remainText='已达标 ✓'; noteTone='ok'; }
    else if(current<=0){
      remainText=prev>0?(period==='weekly'?'上周 ':'昨天 ')+num(prev):(period==='weekly'?'这周还没记':'今天还没记');
      noteTone='muted';
    }
    else if(percent>=50){
      const daysLeft=(period==='daily'||period==='streak')?0:Math.max(0,Math.round((Date.parse(periodEnd)-Date.parse(this.today(uid)))/86400000));
      // ml 这种拉丁单位要跟中文之间留一个空格，否则「800 ml就到了」挤成一坨
      const sp=unit&&/[a-zA-Z]/.test(unit)?' ':'';
      remainText='再来 '+num(left)+sp+'就到了'+(daysLeft>0?' · 还剩 '+daysLeft+' 天':'');
      noteTone='strong';
    }
    else{ remainText='还差 '+num(left); noteTone='muted'; }
    const rangeText=period==='weekly'?periodStart.slice(5).replace('-','/')+'–'+periodEnd.slice(5).replace('-','/')
      :period==='monthly'?periodStart.slice(0,7)
      :period==='yearly'?periodStart.slice(0,4)
      :period==='streak'?'连续进行中'
      :period==='window'?periodStart.slice(5).replace('-','/')+'–'+periodEnd.slice(5).replace('-','/')
      :periodStart.slice(5).replace('-','/');
    return {
      key,label:this.labelOf(uid,key),period,
      periodLabel:this.periodLabelOf(period),
      // 周环用淡一档的同色相：三圈并排，主色太重太跳。
      // 唯独心肺例外：淡红发灰发浅、显脏（用户点名「太浅」），周心肺直接用日环正红。
      // 这一行默认色先算好，再让 colorFor 套用户覆盖（没改过的 key 用默认）。
      metric,unit,
      color:this.colorFor(uid,key,(period==='weekly'&&key!=='cardio')?weekColor(COLOR[key]||TOKENS.body):(COLOR[key]||TOKENS.body)),
      current,target,recordOnly,closed,done,percent,prev,
      hidden:!!(g&&g.hidden),
      valueText:recordOnly?(current>0?num(current):'未记录'):current+'/'+target+' '+unit,
      shortText:recordOnly?(current>0?num(current):'未记录'):current+'/'+target+' '+unit,
      remainText,noteTone,
      rangeText
    };
  }

  // 这一天有没有记过这一项（按类别去重：喝几次水都只算一项）
  hasRecordOn(uid,key,date){
    if(key==='cardio')return (this.db.activities||[]).some(a=>a.userId===uid
      &&CARDIO_TYPES.indexOf(a.type)>=0&&day(a.occurredAt,this.zone(uid))===date);
    if(key==='strength'){
      const ids=new Set((this.db.projects||[]).filter(p=>p.userId===uid&&p.kind==='resistance').map(p=>p.id));
      return (this.db.checkins||[]).some(c=>c.userId===uid&&ids.has(c.projectId)&&c.date===date);
    }
    if(key==='water')return this.waterMl(uid,date)>0;
    if(key==='english')return this.englishWords(uid,date)>0;
    if(key.indexOf('cat:')===0){
      const ids=new Set((this.db.projects||[]).filter(p=>p.userId===uid&&p.categoryId===key.slice(4)).map(p=>p.id));
      return (this.db.checkins||[]).some(c=>c.userId===uid&&ids.has(c.projectId)&&c.date===date);
    }
    return false;
  }

  // 老账号第一次进来时拆目标：饮水沿用原来那个每日毫升数，心肺/抗阻/英语原来靠难度档位，
  // 档位取消后不再替用户编一个目标 → 只记录、不设目标。不静默重置，也不自动提高。
  migrate(uid){
    if((this.db.goals||[]).some(g=>g.userId===uid))return;
    const today=this.today(uid),rows=[];
    const water=(this.db.projects||[]).find(p=>p.userId===uid&&p.kind==='hydration'&&p.hydration);
    if(water&&Number(water.hydration.targetMl)>0)
      rows.push({key:'water',period:'daily',metric:'ml',target:Math.round(water.hydration.targetMl),recordOnly:false});
    for(const key of ['cardio','strength','english'])
      if(this.enabled(uid,key))rows.push({key,period:PERIOD[key],metric:METRIC[key],target:null,recordOnly:true});
    for(const r of rows){
      this.db.goals.push({id:randomUUID(),userId:uid,key:r.key,period:r.period,metric:r.metric,target:r.target,
        recordOnly:r.recordOnly,auto:true,hidden:false,effectiveFrom:r.period==='weekly'?monday(today):today,
        createdAt:this.s.clock(),note:'migrated'});
    }
    if(rows.length)this.s.save();
  }

  // 今天的「运动」环：心肺或抗阻，任意一条就算动过。
  // 它不是目标，所以不走 goals 表、也不进设置页——只回答一个问题：今天动过没有。
  // 用「仅记录」语义：记了就浅色划满，没记就是空的，不喊「还差」。
  moveItem(uid,date){
    const activities=(this.db.activities||[]).filter(a=>a.userId===uid&&day(a.occurredAt,this.zone(uid))===date);
    const ids=new Set((this.db.projects||[]).filter(p=>p.userId===uid&&p.kind==='resistance').map(p=>p.id));
    const lifts=(this.db.checkins||[]).filter(c=>c.userId===uid&&ids.has(c.projectId)&&c.date===date);
    const INTENSITY_LABEL={low:'低强度',moderate:'中等强度',vigorous:'高强度'},PART_LABEL={upper:'上肢',lower:'下肢',full:'全身'};
    const details=activities.map(a=>(RULES[a.type]?.label||'运动')+(a.durationSec?' '+Math.round(a.durationSec/60*10)/10+'分钟':'')+' · '+(INTENSITY_LABEL[a.intensity]||'强度未标注')).concat(lifts.map(c=>'抗阻 · '+(PART_LABEL[c.part]||'训练')));
    const done=details.length>0;
    return {
      key:'move',label:'运动',period:'daily',periodLabel:'今日',
      metric:'count',unit:'',color:this.colorFor(uid,'move',TOKENS.move),
      current:done?1:0,target:0,recordOnly:true,closed:false,done,percent:done?100:0,prev:0,
      hidden:false,
      valueText:done?'运动 '+details.length+' 项':'未记录',shortText:done?'运动 '+details.length+' 项':'未记录',details,
      remainText:done?(details.length===1?details[0]:'具体内容见分享记录'):'日常活动也可以记',noteTone:done?'ok':'muted',
      rangeText:date.slice(5).replace('-','/')
    };
  }

  // ── 周规则（用户 10-29 定稿）：每日项目也能进周环，按「一周至少 N 天」算达标。──
  // 规则定死后不能改数字（防作弊），只能整条删除再重设。默认口径：饮水一周 5 天、英文一周 7 天。
  weekRules(uid){
    const u=this.s.user(uid);
    if(!u.weekRules){u.weekRules={water:5,english:7};this.s.save();}
    return u.weekRules;
  }
  // 周化身（饮水/英语的周规则项）自己的显隐——和日视图的显隐解绑（用户 10-29：
  // 日视图里隐藏饮水只影响日环；周视图里显隐单独一套，互不牵连）
  weekHidden(uid){
    const u=this.s.user(uid);
    if(!u.weekHidden){u.weekHidden={};this.s.save();}
    return u.weekHidden;
  }
  setWeekHidden(uid,key,hidden){
    this.s.user(uid);
    if(typeof hidden!=='boolean')fail('开关无效');
    const map=this.weekHidden(uid);
    if(hidden)map[key]=true;else delete map[key];
    this.s.save();
    return {key,hidden,scope:'week'};
  }
  // 设 / 删周规则。n 为 1-7 的整数；n 为 null = 删除（删了可以重设，但数字本身定死）。
  setWeekRule(uid,key,n){
    if(BUILTIN.indexOf(key)>=0&&PERIOD[key]!=='daily')fail('心肺和抗阻本身就是周目标，不需要周规则');
    if(key==='move'||key.indexOf('cat:')<0&&(key!=='water'&&key!=='english'))fail('这个项目不能设周规则');
    const rules=this.weekRules(uid);
    if(n===null||n===undefined||n===''){delete rules[key];this.s.save();return {key,weekRule:null};}
    if(!Number.isInteger(n)||n<1||n>7)fail('一周次数要在这 1-7 天里选');
    if(rules[key])fail('周规则定死后不能改，删除后才能重设');
    rules[key]=n;this.s.save();
    return {key,weekRule:n};
  }
  // 每日项目的「周规则」环：本周达标 N 天就点亮。
  // 达标口径跟每日那条一致（每日定线的按线判 closed；仅记录的记过就算）——
  // 也就是说「一周 5 天」数的是「那天真完成了」，不是「那天随手记了一笔」。
  weekRuleItem(uid,key,n,start,end){
    let days=0;
    for(let d=start;d<=end;d=shift(d,1)){
      const it=this.item(uid,key,'daily',d,d);
      if(it.closed||(it.recordOnly&&it.done))days++;
    }
    return {key,label:this.labelOf(uid,key),period:'weekly',periodLabel:'每周',
      current:days,target:n,recordOnly:false,closed:days>=n,done:days>0,weekRule:true,
      percent:Math.min(100,Math.round(days/n*100)),unit:'天',
      color:this.colorFor(uid,key,weekColor(COLOR[key]||TOKENS.body)),
      valueText:'达标 '+days+' / '+n+' 天',
      remainText:days>=n?'本周已达标':'还差 '+(n-days)+' 天'};
  }

  // 今日组 / 本周组：两套圆环各放各周期的项目，不合并成一个完成率
  view(uid){
    this.migrate(uid);
    const today=this.today(uid),span=this.range('weekly',today);
    // 运动环放最外层（第一个），饮水/英语排在它里面：最外圈永远是「今天动过没有」
    const day=[this.moveItem(uid,today)],wk=[];let recordedToday=0;
    for(const key of this.keysOf(uid)){
      const period=this.periodFor(uid,key);
      // 月 / 年 / 连续 / 限期：各自算自己的起止（连续从当前这一段头开始，限期用目标上存的起止），
      // 进周组——它们跟周目标一样是「一段时间的达成」，不属于某一天。
      let it;
      if(period==='weekly')it=this.item(uid,key,'weekly',span.start,span.end);
      else if(period==='daily')it=this.item(uid,key,'daily',today,today);
      else{
        const g=this.current(uid,key).goal;
        let s,e;
        if(period==='streak'){s=this.streakStart(uid,key,today);e=today;}
        else if(period==='window'&&g&&g.startDate){s=g.startDate;e=g.endDate||today;}
        else{const r=this.range(period,today);s=r.start;e=r.end;}
        it=this.item(uid,key,period,s,e);
      }
      if(this.hasRecordOn(uid,key,today))recordedToday++;
      // 隐藏的项也留在数组里（带 hidden 标记）：环的槽位按序号排，隐藏一个，
      // 剩下的环不许往里跳位（用户 10-29）。前端把隐藏槽位画成透明。
      (period==='daily'?day:wk).push(it);
      // 周规则（用户 10-29 定稿）：每日项目按「一周至少 N 天」进周环——默认饮水 5 天、英文 7 天。
      // 显隐跟每日那条走；环几何最多画 3 圈，更多规则项进图例和周闭环考核（都算数）。
      const n=(this.weekRules(uid))[key];
      if(period==='daily'&&n){
        const wr=this.weekRuleItem(uid,key,n,span.start,span.end);
        // 显隐独立（用户 10-29）：周化身不再跟每日那条走，周视图里自己管自己
        wr.hidden=!!this.weekHidden(uid)[key];
        wk.push(wr);
      }
    }
    // compare 给周卡用：本周 vs 上周的折算分钟差（讲变化，不讲连续）
    return {today,weekStart:span.start,weekEnd:span.end,day,week:wk,recordedToday,compare:this.weekCompare(uid)};
  }

  // 设置页用：所有项目都列出来（包括隐藏的），隐藏只影响展示。
  // 每日项目带 weekRule 字段（null = 没设周规则）——圆环编辑器靠它渲染周规则面板。
  list(uid){
    this.migrate(uid);
    const today=this.today(uid),span=this.range('weekly',today);
    const rules=this.weekRules(uid);
    const wh=this.weekHidden(uid);
    const all=this.keysOf(uid).map(key=>{
      const cur=this.current(uid,key),period=this.periodFor(uid,key);
      const it=period==='weekly'?this.item(uid,key,'weekly',span.start,span.end):this.item(uid,key,'daily',today,today);
      const row=cur.goal||cur.pending||{};
      return Object.assign({},it,{hidden:!!row.hidden,goal:cur.goal||null,pending:cur.pending||null,
        weekRule:period==='daily'?(rules[key]||null):null,
        weekHidden:period==='daily'?!!wh[key]:null});
    });
    return {today,weekStart:span.start,weekEnd:span.end,all};
  }

  // ── 设置目标 ──
  // 饮水项目：设「体重 × 系数」时需要它存在，不然以后改体重目标跟不上。
  // 老账号可能还没建，就顺手建一个，不让用户先去别处点一遍。
  waterProject(uid){
    let p=(this.db.projects||[]).find(x=>x.userId===uid&&x.kind==='hydration');
    if(p)return p;
    let c=(this.db.categories||[]).find(c=>c.userId===uid&&c.name==='饮水');
    if(!c){c={id:randomUUID(),userId:uid,name:'饮水',createdAt:this.s.clock()};this.db.categories.push(c);}
    p={id:randomUUID(),userId:uid,categoryId:c.id,name:'饮水',kind:'hydration',sportType:null,hydration:null,goal:null,note:null,color:null,icon:'💧',createdAt:this.s.clock()};
    this.db.projects.push(p);
    return p;
  }

  setGoal(uid,key,input){
    const inp=input||{};
    this.s.user(uid);
    if(BUILTIN.indexOf(key)<0&&key.indexOf('cat:')!==0)fail('目标项不存在');
    if(key.indexOf('cat:')===0){
      const id=key.slice(4);
      if(!(this.db.categories||[]).some(c=>c.id===id&&c.userId===uid))fail('类别不存在',404);
    }
    // 饮水：用户选的是「体重 × 每公斤多少毫升」，目标由这里换算。
    // 这样以后在体测里改了体重，目标会跟着变（auto 的行由 syncAutoWater 重算）。
    let followWater=false,waterTarget=null;
    if(key==='water'&&inp.followWeight===true){
      const weightKg=Number(inp.weightKg),coefficient=Number(inp.coefficient);
      if(!Number.isFinite(weightKg)||weightKg<20||weightKg>300)fail('请输入20–300kg的体重');
      if([35,37.5,40].indexOf(coefficient)<0)fail('每公斤饮水量可选 35 / 37.5 / 40 ml');
      const est=estimate(weightKg,coefficient);
      waterTarget=est.targetMl;followWater=true;
      const wp=this.waterProject(uid);
      wp.hydration={weightKg,coefficient,minMl:est.minMl,maxMl:est.maxMl,targetMl:est.targetMl};
      this.s.save();
    }
    const period=BUILTIN.indexOf(key)>=0?PERIOD[key]:(this.CUSTOM_PERIODS.indexOf(inp.period)>=0?inp.period:'weekly');
    const metric=BUILTIN.indexOf(key)>=0?METRIC[key]
      :(CUSTOM_METRICS.indexOf(inp.metric)>=0?inp.metric:this.metricOf(uid,key));
    const recordOnly=inp.recordOnly===true&&!followWater;
    // 每周目标必须有一条线：不然这周永远闭不上，奖章和排行榜也就永远没有。
    // 不想定线就别记这个项目（先不记），而不是留一个永远达不成的「仅记录」。

    let target=null;
    if(!recordOnly){
      target=followWater?waterTarget:Number(inp.target);
      if(!Number.isInteger(target)||target<=0)fail('请填写正整数目标值');
      if(target>(MAX_TARGET[metric]||1000))fail('目标值超出范围（最多 '+(MAX_TARGET[metric]||1000)+'）');
      // 抗阻的下限是 2 天/周（ACE/ACSM 最低建议）：可以更高，不能更低；不想定线就走「仅记录」
      if(key==='strength'&&target<2)fail('抗阻每周至少 2 天，想更轻松可以先选「仅记录」');
    }
    const rows=this.rowsOf(uid,key),today=this.today(uid);
    // 「auto / migrated」是系统建议量（老数据迁移、体重换算），用户的第一次显式选择视为首次设置 → 立即生效
    const hasExplicit=rows.some(g=>g.auto!==true&&g.note!=='migrated');
    let effectiveFrom;
    const anchor=period==='weekly'?monday(today):period==='monthly'?today.slice(0,7)+'-01':period==='yearly'?today.slice(0,4)+'-01-01':today;
    if(!rows.length||inp.applyNow===true||!hasExplicit){
      // 第一次设置：立刻作用于当前周期（周目标从本周一算起；连续/限期没有周期起点，就从今天）
      effectiveFrom=anchor;
    }else if(period==='streak'||period==='window'){
      effectiveFrom=today;
    }else{
      // 之后修改：默认下个周期生效，历史周期仍按当时的目标算
      effectiveFrom=this.nextStart(period,today);
    }
    const prev=rows[rows.length-1];
    this.db.goals=(this.db.goals||[]).filter(g=>!(g.userId===uid&&g.key===key&&g.effectiveFrom===effectiveFrom));
    const row={id:randomUUID(),userId:uid,key,period,metric,target,recordOnly,
      hidden:!!(prev&&prev.hidden),effectiveFrom,createdAt:this.s.clock()};
    // auto = 这个数不是用户手填的，是体重换算出来的，体重变了要跟着重算
    if(followWater)row.auto=true;
    this.db.goals.push(row);
    if(key==='water'&&target!=null){const wp=(this.db.projects||[]).find(x=>x.userId===uid&&x.kind==='hydration'&&x.hydration);if(wp){wp.hydration=Object.assign({},wp.hydration,{targetMl:target});}}
    // 英语目标同时就是「每天发几个新词」的配额，两边对上，环才闭得上
    if(key==='english'&&!recordOnly&&target>0&&this.l)this.l.alignQuota(uid,target);
    this.s.save();
    return {goal:row,previous:prev||null,
      effectiveFrom,
      appliesNow:effectiveFrom<=today,
      appliesText:effectiveFrom<=today
        ?(period==='weekly'?'已生效（本周一起算）':period==='monthly'?'已生效（本月 1 日起算）':period==='yearly'?'已生效（今年 1 月 1 日起算）':'已生效（今天起算）')
        :('将于 '+effectiveFrom+' 起的周期生效，之前的记录仍按原目标计算')};
  }
  // 自建习惯的目标写在项目上（周期 / 目标值 / 指标），这里同步一份到目标表，
  // 好让圆环、成就和目标历史用同一套口径；周期周期只认「每周 / 每日」。
  syncFromProject(uid,project){
    if(!project||!project.goal)return null;
    if(this.CUSTOM_PERIODS.indexOf(project.goal.period)<0)return null;
    const c=(this.db.categories||[]).find(x=>x.id===project.categoryId&&x.userId===uid);
    if(!c||['心肺训练','抗阻训练','饮水','英文学习'].indexOf(c.name)>=0)return null;
    const key='cat:'+c.id,period=project.goal.period;
    const rows=this.rowsOf(uid,key),today=this.today(uid);
    // 每日/每周/每月/每年：锚在周期起点（首次 = 当前周期，之后 = 下周期，改了不追溯）；
    // 连续 / 限期没有周期起点，改了立即生效。
    const anchored=period==='weekly'?monday(today):period==='monthly'?today.slice(0,7)+'-01':period==='yearly'?today.slice(0,4)+'-01-01':today;
    const effectiveFrom=!rows.length?anchored:(period==='streak'||period==='window')?today:this.nextStart(period,today);
    const target=Number(project.goal.target)>0?Number(project.goal.target):null;
    this.db.goals=(this.db.goals||[]).filter(g=>!(g.userId===uid&&g.key===key&&g.effectiveFrom===effectiveFrom));
    const row={id:randomUUID(),userId:uid,key,period,metric:project.metric||'count',
      target,recordOnly:!target,hidden:!!(rows[rows.length-1]&&rows[rows.length-1].hidden),
      months:period==='window'?project.goal.months:undefined,
      startDate:period==='window'?project.goal.startDate:undefined,
      endDate:period==='window'?project.goal.endDate:undefined,
      effectiveFrom,createdAt:this.s.clock()};
    this.db.goals.push(row);
    this.s.save();
    return row;
  }
  // 体重 / 系数变化时的自动建议量：只更新「没被用户显式设过」的饮水目标
  syncAutoWater(uid,targetMl){
    const today=this.today(uid),row=this.effective(uid,'water',today),t=Math.round(targetMl);
    if(row&&row.auto!==true)return row;
    this.db.goals=(this.db.goals||[]).filter(g=>!(g.userId===uid&&g.key==='water'&&g.effectiveFrom===today));
    const n={id:randomUUID(),userId:uid,key:'water',period:'daily',metric:'ml',target:t,recordOnly:false,auto:true,hidden:!!(row&&row.hidden),effectiveFrom:today,createdAt:this.s.clock()};
    this.db.goals.push(n);this.s.save();return n;
  }
  metricOf(uid,key){
    const g=this.current(uid,key).goal;
    return g&&g.metric?g.metric:'count';
  }
  // 隐藏只是不显示，数据一条都不删
  setHidden(uid,key,hidden){
    this.s.user(uid);
    if(typeof hidden!=='boolean')fail('开关无效');
    let n=0;
    for(const g of (this.db.goals||[]))if(g.userId===uid&&g.key===key){g.hidden=hidden;n++;}
    if(!n){
      // 没设过目标也能隐藏：补一条「仅记录 + 隐藏」
      this.db.goals.push({id:randomUUID(),userId:uid,key,period:this.periodFor(uid,key),
        metric:BUILTIN.indexOf(key)>=0?METRIC[key]:'count',target:null,recordOnly:true,hidden,
        effectiveFrom:this.today(uid),createdAt:this.s.clock()});
    }
    this.s.save();
    return {key,hidden};
  }

  // ── 记录天数（饮水按天算，不按杯数；体测也算记录） ──
  recordDays(uid){
    const tz=this.zone(uid),set=new Set();
    for(const a of (this.db.activities||[]))if(a.userId===uid)set.add(day(a.occurredAt,tz));
    for(const c of (this.db.checkins||[]))if(c.userId===uid&&c.date)set.add(c.date);
    for(const e of (this.db.water_entries||[]))if(e.userId===uid&&e.date)set.add(e.date);
    for(const b of (this.db.body_metrics||[]))if(b.userId===uid&&b.date)set.add(b.date);
    for(const c of (this.db.word_cards||[]))if(c.userId===uid&&c.lastAt)set.add(c.lastAt);
    return set;
  }
  // 某个周期里「所有设了目标的项」是否都达标；没有目标项就不算达标也不算失败。
  // 周规则（饮水 5 天 / 英文 7 天等）也算进周闭环（用户 10-29 定稿）：定了规则就是目标。
  periodMet(uid,period,start,end){
    let checked=0;
    const rules=this.weekRules(uid);
    for(const key of this.keysOf(uid)){
      const p=this.periodFor(uid,key);
      if(p===period){
        const g=this.effective(uid,key,start);
        if(g&&!g.recordOnly&&Number(g.target)>0){
          checked++;
          const it=this.item(uid,key,period,start,end);
          if(!it.closed)return {met:false,checked};
        }
      }
      if(period==='weekly'&&p==='daily'&&rules[key]){
        checked++;
        const wr=this.weekRuleItem(uid,key,rules[key],start,end);
        if(!wr.closed)return {met:false,checked};
      }
    }
    return {met:checked>0,checked};
  }
  firstDay(uid){
    const set=this.recordDays(uid);
    return set.size?[...set].sort()[0]:null;
  }

  // ── 周闭环唯一口径：某周（周一开局）所有「设了目标的周目标」都达标。
    // 排行榜和月度奖章都用这份集合；domain.Service 未注入 goals 时另有兜底。 ──
  closedWeeks(uid){
    this.migrate(uid);
    const today=this.today(uid),tz=this.zone(uid),closed=new Set();
    const first=this.firstDay(uid);
    if(first){
      let m=monday(first),n=0;
      while(m<=today&&n<MAX_WEEKS){
        const end=shift(m,6);
        if(end<=today&&this.periodMet(uid,'weekly',m,end).met)closed.add(m);
        m=shift(m,7);n++;
      }
    }
    return {closed,today,tz};
  }

  achievements(uid){
    this.migrate(uid);
    const today=this.today(uid);
    const days=this.recordDays(uid);
    const recordDays=days.size;
    const first=this.firstDay(uid);

    // 已经过完的周（周日 <= 今天）才算一个完整周期；没过完的本周不计
    const closedWeeks=new Set(),closedDays=new Set();
    let weeklyPeriods=0,dailyPeriods=0;
    if(first){
      let m=monday(first),n=0;
      while(m<=today&&n<MAX_WEEKS){
        const end=shift(m,6);
        if(end<=today){const r=this.periodMet(uid,'weekly',m,end);if(r.met){closedWeeks.add(m);weeklyPeriods++;}}
        m=shift(m,7);n++;
      }
      let d=first,n2=0;
      while(d<=today&&n2<MAX_DAYS){
        const r=this.periodMet(uid,'daily',d,d);
        if(r.met){closedDays.add(d);dailyPeriods++;}
        d=shift(d,1);n2++;
      }
    }
    // 连续周：从最近一个已过完的周往回数
    let weekStreak=0;
    {
      let m=monday(today);
      if(shift(m,6)>today)m=shift(m,-7);
      while(closedWeeks.has(m)&&weekStreak<MAX_WEEKS){weekStreak++;m=shift(m,-7);}
    }
    // 连续天：只统计用户主动设成「每日」的目标，按项分别算
    const dailyStreaks=[];
    for(const key of this.keysOf(uid)){
      if(this.periodFor(uid,key)!=='daily')continue;
      const g=this.effective(uid,key,today);
      if(!g||g.recordOnly===true||!(Number(g.target)>0))continue;
      const met=date=>{const goal=this.effective(uid,key,date);return !!goal&&goal.period==='daily'&&!goal.recordOnly&&Number(goal.target)>0&&this.item(uid,key,'daily',date,date).closed;};
      let n=0,d=met(today)?today:shift(today,-1);
      while(n<MAX_DAYS&&met(d)){n++;d=shift(d,-1);}
      dailyStreaks.push({key,label:this.labelOf(uid,key),streak:n});
    }

    const badges=[];
    const add=(id,label,progress,target,note)=>badges.push({id,label,progress:Math.min(progress,target),target,earned:progress>=target,note:note||''});
    add('first','第一次记录',recordDays>0?1:0,1,'记下第一笔，就算开始');
    for(const n of [10,50,100,300])add('days-'+n,'累计记录 '+n+' 天',recordDays,n,'有记录的日子，一天算一次');
    const periods=weeklyPeriods+dailyPeriods;
    for(const n of [1,4,12])add('periods-'+n,'完成 '+n+' 个目标周期',periods,n,'周目标与日目标分别计算');
    for(const n of [4,12])add('weeks-'+n,'连续 '+n+' 周完成周目标',weekStreak,n,'按自然周算，休息日不扣分');
    for(const s of dailyStreaks){
      for(const n of [30,90,180,365])add('streak-'+s.key+'-'+n,'「'+s.label+'」连续 '+n+' 天',s.streak,n,'只有你自己设成每日的目标才算');
    }
    return {recordDays,completedPeriods:periods,weeklyPeriods,dailyPeriods,weekStreak,dailyStreaks,badges,
      closedWeeks:[...closedWeeks].sort(),closedDays:[...closedDays].sort(),firstDay:first};
  }
}

module.exports={Goals,BUILTIN,LABEL,PERIOD,METRIC,UNIT,COLOR,PRESET,CUSTOM_METRICS};
