'use strict';
const {randomUUID}=require('node:crypto');
const {fail,day,shift}=require('./domain');
const {estimate}=require('../miniprogram/utils/hydration');
const {SPORTS,qualifies}=require('../miniprogram/utils/sports');
const {pickColor,pickIcon,COLORS,CATEGORY_COLORS}=require('../miniprogram/utils/palette');
function name(value){if(typeof value!=='string'||!value.trim()||value.trim().length>30)fail('名称须为1–30字');return value.trim();}
function note(value){if(value===undefined||value===null)return null;if(typeof value!=='string')fail('备注须为文字');const text=value.trim();if(text.length>30)fail('备注不超过30字');return text||null;}
function goal(value,today,metric){
 const PERIODS=['daily','weekly','monthly','yearly','streak','window'];
 if(!value||!PERIODS.includes(value.period))fail('请选择目标周期');
 // 上限按单位分两套：次数按「天数」（一天最多打 N 次），分钟按真实时间上限，
 // 自定义数值（步数、页数这类）放宽到 100000，别让「每天 8000 步」这种目标存不进来。
 let extra={};
 let max={daily:20,weekly:7,monthly:31,yearly:366,streak:365}[value.period];
 if(metric==='duration'){max={daily:1440,weekly:10080,monthly:44640,yearly:527040,streak:527040}[value.period];}
 else if(metric==='value'){max=100000;}
 if(value.period==='window'){
  if(!Number.isInteger(value.months)||value.months<1||value.months>24)fail('期限须为1–24个月');
  const start=today;const [y,m,d]=start.split('-').map(Number);
  const first=new Date(Date.UTC(y,m-1+value.months,1));
  const limit=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const after=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,limit))).toISOString().slice(0,10);
  extra={months:value.months,startDate:start,endDate:shift(after,-1)};
  const days=Math.round((Date.parse(after+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);
  max=metric==='duration'?days*1440:metric==='value'?100000:days;
 }
 if(!Number.isInteger(value.target)||value.target<1||value.target>max)fail('目标值超出可选范围，换个数试试');
 return {period:value.period,target:value.target,...extra};
}
function runs(days){let longest=0,current=0,previous;const lengths=[];for(const d of days){if(previous&&shift(previous,1)===d)current++;else{if(current)lengths.push(current);current=1;}longest=Math.max(longest,current);previous=d;}if(current)lengths.push(current);return {longest,lengths};}
function monday(d){return shift(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));}
function progress(project,dates,today,amounts){const days=[...new Set(dates)].filter(d=>d<=today).sort(),set=new Set(days);const r=runs(days);let cursor=set.has(today)?today:shift(today,-1),current=0;while(set.has(cursor)){current++;cursor=shift(cursor,-1);}
 // 分钟 / 数值目标：进度按每笔 amount 求和（一天多笔叠加）；次数目标：一天只算 1。
 const amounted=project.metric==='duration'||project.metric==='value';
 const val=d=>amounted?(Number(amounts&&amounts[d])||0):1;
 const g=project.goal||{period:'weekly',target:0};let start,end,count,completed;
 if(!(g.target>0)){start=end=null;count=amounted?days.reduce((n,d)=>n+val(d),0):days.length;completed=0;} // 仅记录：不算达标也不算失败
 else if(g.period==='window'){start=g.startDate;end=g.endDate;count=days.filter(d=>d>=start&&d<=end).reduce((n,d)=>n+val(d),0);completed=count>=g.target?1:0;}
 else if(g.period==='streak'){start=shift(today,-Math.max(current-1,0));end=today;count=current;completed=r.lengths.reduce((n,len)=>n+Math.floor(len/g.target),0);}
 else{start=g.period==='daily'?today:g.period==='weekly'?monday(today):g.period==='monthly'?today.slice(0,7)+'-01':today.slice(0,4)+'-01-01';end=g.period==='daily'?today:g.period==='weekly'?shift(start,6):g.period==='monthly'?shift(shift(today.slice(0,7)+'-01',32).slice(0,7)+'-01',-1):today.slice(0,4)+'-12-31';
  // 每个周期桶一个值：次数桶数天数，分钟/数值桶求和；count=当前周期值，completed=历史达标周期数
  const buckets={};for(const d of days){const k=g.period==='daily'?d:g.period==='weekly'?monday(d):g.period==='monthly'?d.slice(0,7):d.slice(0,4);buckets[k]=(buckets[k]||0)+val(d);}
  count=buckets[g.period==='daily'?today:g.period==='weekly'?monday(today):g.period==='monthly'?today.slice(0,7):today.slice(0,4)]||0;
  completed=Object.values(buckets).filter(n=>n>=g.target).length;}
 return {total:amounted?days.reduce((n,d)=>n+val(d),0):days.length,current,longest:r.longest,completedGoals:completed,count,target:g.target||0,period:g.period,start,end,achieved:g.target>0&&count>=g.target,percent:g.target>0?Math.min(100,Math.round(count/g.target*100)):0,last:days.at(-1)||null,days,trail:Array.from({length:28},(_,i)=>{const date=shift(today,i-27);return {date,active:set.has(date)};})};}
// ── 「运动」通路（2026-10-30 用户定稿）────────────────────────────
// 类别可以挂 sport 标记：挂了的类别（及其下的打卡项目）算「运动」，
// 进运动热力图、进教练看板的训练结构乐高柱。内置的心肺/抗阻两个类别
// 按名字恒为运动，不用存标记——老库不用迁移，新标记只影响用户自建的。
const BUILTIN_SPORT = ['心肺训练', '抗阻训练'];
function sportOf(c) { return c.sport === true || BUILTIN_SPORT.indexOf(c.name) >= 0; }
class Habits{
 ensureResistance(uid){
  this.s.user(uid);
  const existing=this.db.projects.find(p=>p.userId===uid&&p.kind==='resistance');
  if(existing)return existing;
  let c=this.db.categories.find(c=>c.userId===uid&&c.name==='抗阻训练');
  if(!c)c=this.createCategory(uid,{name:'抗阻训练'});
  const p={id:randomUUID(),userId:uid,categoryId:c.id,name:'力量训练',kind:'resistance',sportType:null,hydration:null,goal:null,metric:null,note:null,color:pickColor(CATEGORY_COLORS['抗阻训练'])||COLORS[1],icon:pickIcon('bars'),createdAt:this.s.clock()};
  this.db.projects.push(p);this.s.save();return p;
 }


 constructor(service){this.s=service;for(const key of ['categories','projects','checkins','water_entries'])service.db[key]||=[];for(const a of service.db.activities)this.attachActivity(a.userId,a,false);}
 get db(){return this.s.db;}
 category(uid,id){this.s.user(uid);const c=this.db.categories.find(c=>c.id===id&&c.userId===uid);if(!c)fail('类别不存在',404);return c;}
 project(uid,id){this.s.user(uid);const p=this.db.projects.find(p=>p.id===id&&p.userId===uid);if(!p)fail('项目不存在',404);return p;}
 createCategory(uid,input){this.s.user(uid);const title=name(input.name);if(this.db.categories.some(c=>c.userId===uid&&c.name===title))fail('该类别已存在',409);// sport=true = 用户声明「这个类别练的是身体」：瑜伽、球类都归进运动统计
 const c={id:randomUUID(),userId:uid,name:title,sport:input.sport===true,createdAt:this.s.clock()};this.db.categories.push(c);this.s.save();return c;}
 createProject(uid,input,allowLearning=false){const c=this.category(uid,input.categoryId);const title=name(input.name),g=goal(input.goal,day(this.s.clock(),this.s.user(uid).timeZone),input.metric);const kind=input.kind||(input.sportType?'sport':'generic');if(!['sport','generic','resistance','hydration','learning'].includes(kind))fail('项目方式无效');if(kind==='learning'&&!allowLearning)fail('英文项目由学习完成后自动建立');let hydration=null;if(kind==='hydration'){const weightKg=input.hydration?.weightKg,coefficient=input.hydration?.coefficient;if(typeof weightKg!=='number'||!Number.isFinite(weightKg)||weightKg<20||weightKg>300||Math.abs(weightKg*10-Math.round(weightKg*10))>0.00001)fail('请输入20–300kg体重，最多一位小数');if(typeof coefficient!=='number'||coefficient<35||coefficient>40||coefficient*2%1!==0)fail('请选择35–40ml/kg范围内的目标');hydration={weightKg,coefficient,...estimate(weightKg,coefficient)};}const sportType=input.sportType||null;if((kind==='sport')!==!!sportType)fail('运动项目需选择对应类型');if(sportType&&!SPORTS.some(s=>s.type===sportType))fail('运动类型无效');if(this.db.projects.some(p=>p.userId===uid&&p.categoryId===c.id&&p.name===title))fail('该项目已存在',409);const metric=['count','duration','value'].indexOf(input.metric)>=0?input.metric:null;const p={id:randomUUID(),userId:uid,categoryId:c.id,name:title,kind,sportType,metric,hydration,goal:kind==='hydration'?null:g,note:note(input.note),color:pickColor(input.color),icon:pickIcon(input.icon),createdAt:this.s.clock()};this.db.projects.push(p);if(this.goals)this.goals.syncFromProject(uid,p);this.s.save();return p;}
 updateProject(uid,id,input){const p=this.project(uid,id);const patch={};if(input.name!==undefined){const title=name(input.name);if(this.db.projects.some(q=>q.userId===uid&&q.categoryId===p.categoryId&&q.id!==p.id&&q.name===title))fail('该项目已存在',409);patch.name=title;}if(input.note!==undefined)patch.note=note(input.note);if(input.metric!==undefined){if(!['count','duration','value'].includes(input.metric))fail('指标无效');patch.metric=input.metric;}if(input.color!==undefined)patch.color=pickColor(input.color);if(input.icon!==undefined)patch.icon=pickIcon(input.icon);if(input.goal!==undefined)patch.goal=p.kind==='hydration'?null:goal(input.goal,day(this.s.clock(),this.s.user(uid).timeZone),input.metric!==undefined?input.metric:p.metric);if(input.hydration!==undefined){if(p.kind!=='hydration')fail('非饮水项目');const weightKg=input.hydration?.weightKg,coefficient=input.hydration?.coefficient;if(typeof weightKg!=='number'||!Number.isFinite(weightKg)||weightKg<20||weightKg>300||Math.abs(weightKg*10-Math.round(weightKg*10))>0.00001)fail('请输入20–300kg体重，最多一位小数');if(typeof coefficient!=='number'||coefficient<35||coefficient>40||coefficient*2%1!==0)fail('请选择35–40ml/kg范围内的目标');patch.hydration={weightKg,coefficient,...estimate(weightKg,coefficient)};}Object.assign(p,patch);if(this.goals&&p.kind==='hydration'&&patch.hydration)this.goals.syncAutoWater(uid,p.hydration.targetMl);if(this.goals&&(patch.goal||patch.metric))this.goals.syncFromProject(uid,p);this.s.save();return p;}
attachActivity(uid,a,persist=true){if(a.projectId)return;const sport=SPORTS.find(s=>s.type===a.type);let p=this.db.projects.find(p=>p.userId===uid&&p.sportType===a.type);if(!p){let c=this.db.categories.find(c=>c.userId===uid&&c.name==='心肺训练');if(!c){c={id:randomUUID(),userId:uid,name:'心肺训练',createdAt:a.createdAt};this.db.categories.push(c);}p={id:randomUUID(),userId:uid,categoryId:c.id,name:sport.label,sportType:a.type,goal:null,createdAt:a.createdAt};this.db.projects.push(p);}a.projectId=p.id;if(persist)this.s.save();}
 dates(uid,p){if(p.kind==='hydration'){const totals={};for(const e of this.db.water_entries.filter(e=>e.userId===uid&&e.projectId===p.id))totals[e.date]=(totals[e.date]||0)+e.amountMl;return Object.keys(totals).filter(d=>totals[d]>=p.hydration.targetMl);}if(p.sportType)return this.s.records(uid).filter(a=>a.projectId===p.id&&qualifies(a)).map(a=>day(a.occurredAt,this.s.user(uid).timeZone));return this.db.checkins.filter(c=>c.userId===uid&&c.projectId===p.id).map(c=>c.date);}
 // 同一天可以记多次（比如一天两练），周进度按「天」去重，不按次数叠加。
 // 幂等交给 requestId：同一个 requestId 重复提交只保留一条，避免重试把记录写两遍。
 checkin(uid,pid,input){const p=this.project(uid,pid);if(p.kind==='learning')fail('英文打卡在学习页学词后自动完成');if(p.kind==='hydration')fail('饮水项目需记录实际饮水量');if(p.sportType)fail('运动项目需录入距离和时长');if(input.confirmed!==true)fail('请先确认打卡');const date=input.date,today=day(this.s.clock(),this.s.user(uid).timeZone);if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date>today)fail('打卡日期无效或在未来');const requestId=typeof input.requestId==='string'&&input.requestId?input.requestId:null;if(requestId){if(requestId.length>160)fail('请求ID无效');const prior=this.db.checkins.find(c=>c.userId===uid&&c.projectId===pid&&c.requestId===requestId);if(prior){if(prior.date!==date)fail('重复请求内容不同',409);return prior;}}let amount=null;if(input.amount!=null&&input.amount!==''){amount=Number(input.amount);if(!Number.isFinite(amount)||amount<0||amount>100000)fail('请填写 0–100000 之间的数值');amount=Math.round(amount*10)/10;}// 抗阻只记练了哪一块：上肢 / 下肢 / 全身。时长交给各自的训练 App，这里不做第二套账
 const part=['upper','lower','full'].indexOf(input.part)>=0?input.part:null;
 // 抗阻强度三档，和有氧共用一套词（low/moderate/vigorous），强度饼图才合得拢。
 // 客户端会逼着选（10-30 定稿）；没带就按中等算（老客户端兼容），带错了要拒绝。
 const intensity=input.intensity==null||input.intensity===''?'moderate':input.intensity;
 if(['low','moderate','vigorous'].indexOf(intensity)<0)fail('强度无效');
 const c={id:randomUUID(),projectId:pid,userId:uid,date,amount,part,intensity,timeZone:this.s.user(uid).timeZone,confirmed:true,requestId,createdAt:this.s.clock()};this.db.checkins.push(c);this.s.save();return c;}
 water(uid,pid,input){const p=this.project(uid,pid);if(p.kind!=='hydration')fail('非饮水项目');if(input.confirmed!==true)fail('请确认饮水量');const {date,amountMl,requestId}=input;const today=day(this.s.clock(),this.s.user(uid).timeZone);if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date>today)fail('饮水日期无效');if(!Number.isInteger(amountMl)||amountMl<1||amountMl>2000)fail('单次饮水量须为1–2000ml，请核实输入');if(typeof requestId!=='string'||!requestId||requestId.length>160)fail('请求ID无效');const prior=this.db.water_entries.find(e=>e.userId===uid&&e.requestId===requestId);if(prior){if(prior.projectId!==pid||prior.date!==date||prior.amountMl!==amountMl)fail('重复请求内容不同',409);return prior;}// 纠正当日总量会把旧记录合并掉，但已用过的 requestId 要记住：重试不能把旧的那杯再加一遍
p.waterSeen||={};const seen=p.waterSeen[date]||(p.waterSeen[date]=[]);if(seen.indexOf(requestId)>=0)return {replayed:true,date,amountMl,totalMl:this.db.water_entries.filter(e=>e.userId===uid&&e.projectId===pid&&e.date===date).reduce((n,e)=>n+e.amountMl,0)};if(seen.length>200)seen.shift();seen.push(requestId);const total=this.db.water_entries.filter(e=>e.userId===uid&&e.projectId===pid&&e.date===date).reduce((n,e)=>n+e.amountMl,0);if(total+amountMl>20000)fail('当日输入量过大，请核实');const entry={id:randomUUID(),userId:uid,projectId:pid,date,amountMl,timeZone:this.s.user(uid).timeZone,requestId,createdAt:this.s.clock()};this.db.water_entries.push(entry);p.waterVersions||={};p.waterVersions[date]=(p.waterVersions[date]||0)+1;this.s.save();return entry;}
 setWaterTotal(uid,pid,input){const p=this.project(uid,pid);if(p.kind!=='hydration')fail('非饮水项目');if(input.confirmed!==true)fail('请确认饮水总量');const {date,amountMl,requestId,revision}=input;const today=day(this.s.clock(),this.s.user(uid).timeZone);if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date>today)fail('饮水日期无效');if(!Number.isInteger(amountMl)||amountMl<0||amountMl>20000)fail('请填写0–20000ml的当日总量并核实输入');if(typeof requestId!=='string'||!requestId||requestId.length>160)fail('请求ID无效');p.waterVersions||={};p.waterSeen||={};const seen=p.waterSeen[date]||(p.waterSeen[date]=[]);if(seen.indexOf(requestId)<0){if(seen.length>200)seen.shift();seen.push(requestId);}const records=this.db.water_entries.filter(e=>e.userId===uid&&e.projectId===pid&&e.date===date);const prior=records.find(e=>e.requestId===requestId);if(prior){if(prior.amountMl!==amountMl)fail('重复请求内容不同',409);return prior;}if(!Number.isInteger(revision)||revision!==(p.waterVersions[date]||0))fail('饮水记录已更新，请刷新后重试',409);const entry={id:records[0]?.id||randomUUID(),userId:uid,projectId:pid,date,amountMl,timeZone:this.s.user(uid).timeZone,requestId,mode:'daily-total',createdAt:records[0]?.createdAt||this.s.clock(),updatedAt:this.s.clock()};this.db.water_entries=this.db.water_entries.filter(e=>!(e.userId===uid&&e.projectId===pid&&e.date===date));this.db.water_entries.push(entry);p.waterVersions[date]=(p.waterVersions[date]||0)+1;this.s.save();return entry;}
 removeWater(uid,id){this.s.user(uid);const i=this.db.water_entries.findIndex(e=>e.userId===uid&&e.id===id);if(i<0)fail('记录不存在',404);const old=this.db.water_entries[i],p=this.project(uid,old.projectId);p.waterVersions||={};p.waterVersions[old.date]=(p.waterVersions[old.date]||0)+1;this.db.water_entries.splice(i,1);this.s.save();}
 // 首页那张饮水卡要「最近 7 天」：从今天往回推 7 天，倒序排（今天在最上面）。
 // 只读，不改任何状态；没有饮水项目就返回 null，页面不显示这张卡。
 waterRecent(uid,n=7){
   const p=this.db.projects.find(p=>p.userId===uid&&p.kind==='hydration'&&p.hydration);
   if(!p)return null;
   const today=day(this.s.clock(),this.s.user(uid).timeZone);
   const targetMl=p.hydration.targetMl;
   const days=[];
   for(let i=0;i<n;i++){
     const date=shift(today,-i);
     const totalMl=this.db.water_entries.filter(e=>e.userId===uid&&e.projectId===p.id&&e.date===date).reduce((sum,e)=>sum+e.amountMl,0);
     days.push({date,totalMl,targetMl,percent:targetMl?Math.min(100,Math.floor(totalMl/targetMl*100)):0,
       achieved:targetMl>0&&totalMl>=targetMl,isToday:i===0});
   }
  const t=days[0];
  return {projectId:p.id,totalMl:t.totalMl,targetMl,remainingMl:Math.max(0,targetMl-t.totalMl),
    percent:t.percent,achieved:t.achieved,cupMl:250,revision:p.waterVersions?.[t.date]||0,days};
 }

 waterProgress(uid,p,date){const totalMl=this.db.water_entries.filter(e=>e.userId===uid&&e.projectId===p.id&&e.date===date).reduce((n,e)=>n+e.amountMl,0);const targetMl=p.hydration.targetMl;return {date,totalMl,targetMl,revision:p.waterVersions?.[date]||0,remainingMl:Math.max(0,targetMl-totalMl),percent:Math.floor(totalMl/targetMl*100),achieved:totalMl>=targetMl};}
 removeCheckin(uid,id){this.s.user(uid);const index=this.db.checkins.findIndex(c=>c.id===id&&c.userId===uid);if(index<0)fail('记录不存在',404);this.db.checkins.splice(index,1);this.s.save();}
 // 体测记录了新体重 → 饮水建议量按「体重 × 每公斤系数」重算（用户显式设过的目标优先，不被静默覆盖）
 syncWeight(uid,weightKg){const p=this.db.projects.find(p=>p.userId===uid&&p.kind==='hydration');if(!p||!p.hydration)return null;const coefficient=p.hydration.coefficient||35;if(p.hydration.weightKg===weightKg)return p;const est=estimate(weightKg,coefficient);const goal=this.goals?this.goals.effective(uid,'water',this.goals.today(uid)):null;const explicit=goal&&goal.auto!==true&&Number(goal.target)>0;const target=explicit?Math.round(goal.target):est.targetMl;p.hydration={weightKg,coefficient,minMl:est.minMl,maxMl:est.maxMl,targetMl:target};if(!explicit&&goal&&this.goals)this.goals.syncAutoWater(uid,target);this.s.save();return p;}
 overview(uid){const user=this.s.user(uid),today=day(this.s.clock(),user.timeZone);if(!this.goals)this.goals=new (require('./goals').Goals)(this.s,this);const records=this.s.records(uid);const projects=this.db.projects.filter(p=>p.userId===uid).map(p=>{const record=p.sportType?records.find(a=>a.projectId===p.id&&day(a.occurredAt,user.timeZone)===today):null;const tick=p.sportType?null:this.db.checkins.find(c=>c.userId===uid&&c.projectId===p.id&&c.date===today);return {...p,water:p.kind==='hydration'?this.waterProgress(uid,p,today):null,progress:progress(p,this.dates(uid,p),today,this.amountsOf(uid,p)),todayRecordId:record?record.id:null,todayCheckinId:tick?tick.id:null,recent:p.kind==='resistance'?this.db.checkins.filter(c=>c.userId===uid&&c.projectId===p.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3).map(c=>({date:c.date,part:c.part||''})):null,
// 本周抗阻明细（带 id）：首页抗阻卡展开后逐条列出，每一笔都要能撤销（2026-10-30 用户：所有训练记录可删）
weekRecords:p.kind==='resistance'?this.db.checkins.filter(c=>c.userId===uid&&c.projectId===p.id&&c.date>=monday(today)&&c.date<=today).sort((a,b)=>b.date.localeCompare(a.date)).map(c=>({id:c.id,date:c.date,part:c.part||'',intensity:c.intensity||'moderate'})):null};});const categories=this.db.categories.filter(c=>c.userId===uid).map(c=>{const children=projects.filter(p=>p.categoryId===c.id);const dates=[...new Set(children.flatMap(p=>p.progress.days))].sort();return {...c,water:children.length===1?children[0].water:null,projects:children,monthly:dates.filter(d=>d.startsWith(today.slice(0,7))).length,last:dates.at(-1)||null,trail:Array.from({length:28},(_,i)=>{const date=shift(today,i-27);return {date,active:dates.includes(date)};})};});const total=projects.reduce((n,p)=>n+p.progress.total,0),completed=projects.reduce((n,p)=>n+p.progress.completedGoals,0),longest=Math.max(0,...projects.map(p=>p.progress.longest));const badges=[...[1,10,30,100].map(n=>({id:'checkins-'+n,label:'累计打卡 '+n+' 次',earned:total>=n,progress:Math.min(total,n),target:n})),...[1,4,12,52].map(n=>({id:'goals-'+n,label:'达标 '+n+' 个周期',earned:completed>=n,progress:Math.min(completed,n),target:n})),...[30,90,180,365].map(n=>({id:'streak-'+n,label:'单项目连续 '+n+' 天',earned:longest>=n,progress:Math.min(longest,n),target:n}))];const summary=progress({goal:{period:'weekly',target:3}},projects.flatMap(p=>p.progress.days),today);
 // 本月的抗阻明细（强度饼图要用）：抗阻以前「不分强度」，现在打卡要登记
 // 低/中/高，看板那张饼把有氧和抗阻合在一起讲「这个月练得偏轻还是偏重」。
 const resIds=new Set(projects.filter(p=>p.kind==='resistance').map(p=>p.id));
 const strengthSessions=this.db.checkins.filter(c=>c.userId===uid&&resIds.has(c.projectId)&&c.date.slice(0,7)===today.slice(0,7))
  .map(c=>({date:c.date,part:c.part||null,intensity:c.intensity||'moderate'}));
 return {today,summary,categories,projects,strengthSessions,achievements:this.goals?this.goals.achievements(uid):{totalCheckins:total,completedGoals:completed,longest,badges}};}
 detail(uid,id){const p=this.project(uid,id),today=day(this.s.clock(),this.s.user(uid).timeZone);return {...p,water:p.kind==='hydration'?this.waterProgress(uid,p,today):null,progress:progress(p,this.dates(uid,p),today,this.amountsOf(uid,p)),today,records:p.kind==='hydration'?this.db.water_entries.filter(e=>e.userId===uid&&e.projectId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):p.sportType?this.s.records(uid).filter(a=>a.projectId===id).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)):this.db.checkins.filter(c=>c.userId===uid&&c.projectId===id).sort((a,b)=>b.date.localeCompare(a.date))};}
 // 分钟 / 数值目标用：按天聚合每笔打卡的 amount（一天多笔叠加），progress 靠它求和
 amountsOf(uid,p){const m={};for(const c of this.db.checkins){if(c.userId!==uid||c.projectId!==p.id)continue;const n=Number(c.amount);if(n>0)m[c.date]=(m[c.date]||0)+n;}return m;}
 ensureDefaults(){const now=this.s.clock();
  for(const uid of ['demo-a','demo-b']){
   const cats=this.db.categories.filter(c=>c.userId===uid);
   const ensureCat=name=>{let c=cats.find(c=>c.name===name);if(!c){c={id:randomUUID(),userId:uid,name,createdAt:now};this.db.categories.push(c);}return c;};
   const cardio=ensureCat('心肺训练'),res=ensureCat('抗阻训练'),water=ensureCat('饮水');
   const has=(cid,name)=>this.db.projects.some(p=>p.userId===uid&&p.categoryId===cid&&p.name===name);
   if(!has(cardio.id,'跑步'))this.db.projects.push({id:randomUUID(),userId:uid,categoryId:cardio.id,name:'跑步',kind:'sport',sportType:'running',hydration:null,goal:null,note:null,color:pickColor(CATEGORY_COLORS['心肺训练'])||COLORS[0],icon:'🏃',createdAt:now});
   if(!has(res.id,'力量训练'))this.db.projects.push({id:randomUUID(),userId:uid,categoryId:res.id,name:'力量训练',kind:'resistance',sportType:null,hydration:null,goal:null,note:null,color:pickColor(CATEGORY_COLORS['抗阻训练'])||COLORS[1],icon:'💪',createdAt:now});
   // 饮水目标独立设置，默认按 35ml/kg 的建议量起步（用户在引导或设置里随时改）
   if(!has(water.id,'饮水')){const est=estimate(60,35);this.db.projects.push({id:randomUUID(),userId:uid,categoryId:water.id,name:'饮水',kind:'hydration',sportType:null,hydration:{weightKg:60,coefficient:35,minMl:est.minMl,maxMl:est.maxMl,targetMl:est.targetMl},goal:null,note:null,color:pickColor(CATEGORY_COLORS['饮水'])||COLORS[2],icon:'💧',createdAt:now});}
  }
  this.s.save();
 }
}
module.exports={Habits,progress,sportOf,BUILTIN_SPORT};
