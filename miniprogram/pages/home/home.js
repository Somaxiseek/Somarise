const {api,login,error,change}=require('../../utils/api');
// 截图识别开关（个人主体没法微信认证 → OCR 云调用不可用），见 config/runtime.js。
const {ocrEnabled:OCR_ENABLED}=require('../../config/runtime');
const {pick}=require('../../utils/reflections');
const {SPORTS,qualifies}=require('../../utils/sports');
const {todayReport,shareCard}=require('../../utils/report');
const {paintShareCard,W:SHARE_W,H:SHARE_H}=require('../../utils/sharecard-paint');
const {exportCanvas,stageForShare}=require('../../utils/canvas-export');
const {both:ringSets}=require('../../utils/rings');
const tip=require('../../utils/tip');
const {TOKENS}=require('../../utils/tokens');
function dateKey(instant,zone){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}
// 本周标题下那行日期：日目标显示「10/28」，周目标显示「10/26 – 11/01」。
// 两边都占一行，切换日/周时卡片高度才不会跳一下。
function weekRangeText(goals,today){
  const short=d=>d?d.slice(5).replace('-','/'):'';
  let start=(goals&&goals.weekStart)||'',end=(goals&&goals.weekEnd)||'';
  if(!start&&today){const dt=new Date(today+'T00:00:00Z');const w=(dt.getUTCDay()+6)%7;start=new Date(dt.getTime()-w*86400000).toISOString().slice(0,10);}
  if(!end&&start)end=new Date(new Date(start+'T00:00:00Z').getTime()+6*86400000).toISOString().slice(0,10);
  return start&&end?(short(start)+' – '+short(end)):'';
}
function shift(d,n){return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
// 记录行的日期口径：今天/昨天给「日子」，更早给「10月28日」，后面都跟周几。
// 用户 10-30：下拉列表里要能一眼看出「这一次是几月几号周几」。
const WEEK_CN=['周日','周一','周二','周三','周四','周五','周六'];
function logDateLabel(date,today){
  const wd=WEEK_CN[new Date(date+'T12:00:00Z').getUTCDay()];
  if(date===today)return '今天 '+wd;
  if(today&&date===shift(today,-1))return '昨天 '+wd;
  return Number(date.slice(5,7))+'月'+Number(date.slice(8,10))+'日 '+wd;
}
// 一天里可能有两笔，光有日期分不清，带上发生时刻（本地时区）
function clockLabel(instant,zone){
  try{return new Intl.DateTimeFormat('en-GB',{timeZone:zone||'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(instant));}catch(e){return '';}
}
// 本周一（用户时区）：用 UTC 正午做日期算术，避免跨时区把周一算成周日。
function mondayOf(d){const dt=new Date(d+'T00:00:00Z');const w=(dt.getUTCDay()+6)%7;return new Date(dt.getTime()-w*86400000).toISOString().slice(0,10);}
// 饮水进度只看右侧圆环（服务端算好的 percent）；横向累计条已删（用户 10-29）。
// 「这一杯」的量：拖圆点选（本地预览，50ml 一档），松手不写库。
// 单次饮水的可选上限：服务端单笔最多 2000ml，一次也别喝到目标以上
function cupCeiling(targetMl){ return Math.min(Math.max(500,targetMl||1000),2000); }
Page({popupNoop(){},dismissCelebrate(){this.setData({celebrate:false});},data:Object.assign({loaded:false,bodyOpen:true,waterOpen:false,waterBusy:false,waterDragging:false,waterDragMl:0,waterDragX:50,waterChooseMl:250,report:null,rings:null,ring:null,ringView:'day',ringEditor:false,weekLabel:'',shareOpen:false,shareImage:'',shareNote:'',expanded:false,swipeId:'',swipeDx:0,swipeDragging:false,swipeW:84,openCategories:{},counterModes:{},celebrate:null,bodyText:'',bodyWeight:'—',bodyWeekAvg:'未测',bodyTrail:[],filter:'all',view:'log',month:new Date().toISOString().slice(0,7),tabs:[{id:'all',label:'全部'},...SPORTS.map(s=>({id:s.type,label:s.label}))],quote:''},tip.data),toggleTip(e){tip.toggle.call(this,e);},onLoad(q){this._wantAdd=!!q&&q.add==='1';try{const info=wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync();this.setData({swipeW:Math.round(168*(info.windowWidth||375)/750)});}catch(e){}    try{const v=wx.getStorageSync&&wx.getStorageSync('somactive.bodyOpen');if(v===false)this.setData({bodyOpen:false});}catch(e){}
    // 冷启动秒开（stale-while-revalidate）：优先用内存里上一次的首页数据（和 onShow 会用的
    // 是同一份对象，onShow 命中时就不再重画，杜绝两次重画之间的那一下跳动）；内存没有再退到
    // 本地磁盘缓存。只有两种「第一次」才会空白等网络：彻底没缓存、或跨了月。
    const app=getApp();
    const mem=app.globalData.home;
    if(mem&&mem.stats&&(!mem.stats.month||mem.stats.month===this.data.month)){this.home=mem;this.render();this._painted=true;}
    else{try{const cache=wx.getStorageSync&&wx.getStorageSync('somactive.homeCache');if(cache&&cache.stats){this.home=cache;this.render();this._painted=true;}}catch(e){}}
    const reflection=pick();this.setData({quote:reflection.text,quoteCredit:reflection.kind==='inspired'?'练习灵感 · '+reflection.author:reflection.kind==='translation'?reflection.author+' · 译文':reflection.author});},async onShow(){try{if(!getApp().globalData.token)await login();await this.load();if(this.data.ringEditor){const ed=this.selectComponent('#ringEditor');ed&&ed.refresh();}if(this._wantAdd){this._wantAdd=false;setTimeout(()=>this.add({}),350);}else this.maybeOnboard();}catch(e){this.setData({loadFailed:true});error(e);}},
  // 第一次进来才引导；从引导页退出来也不再追着问（想看随时能在「我的」里重看）
  maybeOnboard(){
    if(this._onboarded)return;
    this._onboarded=true;
    let done=false;
    try{ done=!!(wx.getStorageSync&&wx.getStorageSync('somactive.onboarded')); }catch(e){}
    if(done)return;
    wx.navigateTo({url:'/pages/onboard/onboard'});
  },async load(force=false){
    const app=getApp();
    let h=app.globalData.home;
    // 新鲜度闸门：内存里的首页数据超过 60 秒就当作可能过期，重新拉一次（跨天、跨月也会进这里）。
    // 这样连续切 dock 来回（reLaunch 每次都冷启本页）只在头一趟联网，其余全是内存瞬时渲染，
    // 既不再「停一下」，也不会因为反复重拉云函数而慢。
    const stale=Date.now()-(app.globalData.homeStamp||0)>60000;
    if(force||app.globalData.dirty||!h||h.stats.month!==this.data.month||stale){
      h=await api('/home?month='+this.data.month);
      app.globalData.home=h;
      app.globalData.dirty=false;
      app.globalData.homeStamp=Date.now();
      try{wx.setStorageSync&&wx.setStorageSync('somactive.homeCache',h);}catch(e){}
      this.home=h;
      this.setData({loadFailed:false});
      this.render();
      this._painted=true;
      this.warmRingEditor();
      return;
    }
    // 命中内存里最新的首页数据、且 onLoad 已经用同一份画过：不联网、不重画，
    // 省掉主线程空转，也避免「先画缓存、再画联网同份数据」那下的跳动。
    this.home=h;
    this.setData({loadFailed:false});
    this.warmRingEditor();
  },
  // 预热圆环编辑器：组件常驻首页，趁首页闲下来先把 /goals 拉好，
  // 第一次点圆环就不用对着加载等（真机上那一趟 1.5s+ 就是「跳出慢」的主体）
  warmRingEditor(){
    const ed=this.selectComponent('#ringEditor');
    if(ed&&!ed.data.loaded)setTimeout(()=>ed&&ed.refresh(),0);
  },render(){const h=this.home;if(!h)return;const zone=h.user.timeZone,today=dateKey(Date.now(),zone);this.today=today;const year=+this.data.month.slice(0,4),m=+this.data.month.slice(5),length=new Date(Date.UTC(year,m,0)).getUTCDate();const first=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;const cells=Array.from({length:first},(_,i)=>({key:'b'+i,n:''}));const records=h.activities.map(a=>({...a,date:dateKey(a.occurredAt,zone)}));for(let i=1;i<=length;i++){const d=this.data.month+'-'+String(i).padStart(2,'0');cells.push({key:d,n:i,active:(h.habits?.summary?.days||h.stats.days).includes(d),today:d===today,count:h.habits?h.habits.projects.filter(p=>p.progress.days.includes(d)).length:records.filter(a=>a.date===d).length});}const sports=SPORTS.map(s=>{const list=records.filter(a=>a.type===s.type).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));const valid=new Set(list.filter(qualifies).map(a=>a.date));return {...s,days:[...valid].filter(d=>d.startsWith(this.data.month)).length,last:list[0]?.date||'暂无记录',trail:Array.from({length:28},(_,i)=>{const d=shift(today,i-27);return {date:d,active:valid.has(d)};})};});const allValid=new Set(records.filter(qualifies).map(a=>a.date));const cardio={days:[...allValid].filter(d=>d.startsWith(this.data.month)).length,last:records.map(a=>a.date).sort().pop()||'暂无记录',trail:Array.from({length:28},(_,i)=>{const d=shift(today,i-27);return {date:d,active:allValid.has(d)};})};const habits=h.habits||{categories:[],projects:[],achievements:{badges:[]}};const categories=habits.categories.map(c=>{const fixed=['抗阻训练','饮水','饮食','英文学习'].includes(c.name);const isSport=c.projects.some(p=>p.sportType||p.kind==='sport');// 展开复看（用户 10-30 修订）：自建类别都能下拉看近况；抗阻/英语点卡直接跳页（面板看着累赘，撤）
const expandable=isSport||c.projects.length>1||c.name==='心肺训练'||c.name==='抗阻训练'||!fixed;const direct=c.projects.length===1||fixed;const project=fixed?(c.projects.find(p=>p.kind===({抗阻训练:'resistance',饮水:'hydration',饮食:'nutrition',英文学习:'learning'}[c.name]))||c.projects[0]):c.projects[0];const preset=!c.projects.length?({抗阻训练:'resistance',饮水:'hydration',心肺训练:'cardio',英文学习:'learning'}[c.name]):null;return {...c,en:c.name==='心肺训练'?'CARDIO':c.name==='抗阻训练'?'STRENGTH':c.name==='饮水'?'HYDRATION':c.name==='英文学习'?'ENGLISH':'',directProjectId:direct?project?.id:null,preset,needsSetup:!!preset,open:expandable&&!!this.data.openCategories[c.id],expandable};});for(const item of [{kind:'cardio',name:'心肺训练',en:'CARDIO'},{kind:'resistance',name:'抗阻训练',en:'STRENGTH'},{kind:'hydration',name:'饮水',en:'HYDRATION'},{kind:'learning',name:'英文学习',en:'ENGLISH'}]){if(!categories.some(c=>c.name===item.name)){const existing=habits.projects.find(p=>p.kind===item.kind);categories.push({id:'default:'+item.kind,name:item.name,en:item.en,preset:item.kind,directProjectId:existing?.id||null,needsSetup:!existing,projects:[],monthly:existing?existing.progress.days.filter(d=>d.startsWith(today.slice(0,7))).length:0,last:existing?.progress.last||null,water:existing?.water||null,trail:(()=>{const ds=new Set((existing&&existing.progress&&existing.progress.days)||[]);return Array.from({length:28},(_,i)=>{const d=shift(today,i-27);return {date:d,active:ds.has(d)};});})()});}}const ACCENTS={'心肺训练':'#D93B36','抗阻训练':'#3D6EDC','饮水':'#06B6D4','英文学习':'#A659C5','饮食':'#5C738A'};const PALETTE=['#D93B36','#3D6EDC','#06B6D4','#A659C5','#5C738A','#111111'];categories.forEach((c,i)=>{c.accent=ACCENTS[c.name]||PALETTE[i%PALETTE.length];});for(const c of categories){const p=c.directProjectId?habits.projects.find(p=>p.id===c.directProjectId):c.projects.length===1?c.projects[0]:null;const g=p?.progress||null;const gp=p?.goal||null;// 项目可以只记录（goal 为 null）：不给假百分比，也不读 null 的字段
// 首页卡片统一按「本月」口径显示（用户 11-01：心肺/抗阻/英语三张卡视图不统一，
// 且抗阻无目标时 progress.count 是「本周」天数、标签却写「本月打卡天数」，会多算跨月那一周）。
// 周视图在圆环里已能看到，所以卡片一律用当月打卡天数；目标完成率保留在切换态里。
const monthKey=(this.data.month||today).slice(0,7);const monthDays=(g&&g.days&&g.days.length)?(g.days).filter(d=>typeof d==='string'&&d.startsWith(monthKey)).length:(typeof c.monthly==='number'?c.monthly:0);
c.counterHasGoal=!!(g&&gp&&Number(gp.target)>0);c.counterCount=monthDays;c.counterPercent=c.counterHasGoal?Math.min(100,Math.round(g.count/gp.target*1000)/10):null;c.counterFraction=c.counterHasGoal?g.count+' / '+gp.target:'';c.counterPercentMode=!!this.data.counterModes[c.id];c.counterCaption=c.counterHasGoal?(c.counterPercentMode?'目标完成率':'本月打卡天数'):'本月打卡天数';c.projects=c.projects.map(p=>{const dset=new Set(p.progress?.days||[]);return {...p,accent:p.color||c.accent,counterPercentMode:!!this.data.counterModes[p.id],displayPercent:Math.min(100,Math.round((p.progress?.count||0)/(p.goal?.target||1)*1000)/10),needsData:!!p.sportType,done:!!(p.todayRecordId||p.todayCheckinId),undoId:p.todayRecordId||p.todayCheckinId||'',last7:Array.from({length:7},(_,i)=>{const d=shift(today,i-6);return {date:d,active:dset.has(d)};})};});for(const c of categories){const solo=c.projects.length===1?c.projects[0]:null;if(solo&&!solo.sportType&&(solo.kind==='resistance'||solo.kind==='generic')&&solo.goal&&solo.progress){c.quickProjectId=solo.id;c.quickAccent=solo.color||c.accent;c.quickDone=!!(solo.todayCheckinId||solo.todayRecordId);c.quickCount=solo.progress.count;c.statusText=(solo.goal.period==='weekly'?'本周':solo.goal.period==='yearly'?'今年':solo.goal.period==='streak'?'连续':'期限内')+' '+solo.progress.count+' / '+solo.goal.target+(solo.goal.period==='streak'?'天':'次')+' · '+(solo.todayCheckinId?'今天已打卡':'今天未打卡');}}for(const c of categories){if(c.name!=='心肺训练'&&c.preset!=='cardio')continue;const used=new Set(c.projects.map(p=>p.sportType));c.quickSports=SPORTS.filter(s=>!used.has(s.type)).map(s=>({type:s.type,label:s.label}));}}
const bodyInfo=h.body||{};const bodyLatest=bodyInfo.latest||null;const bodyWeek=bodyInfo.week||{};const bodyText=bodyLatest?(bodyLatest.date===today?'今天已测 · ':'最近 '+bodyLatest.date.slice(5)+' 测 · ')+'体重 '+(bodyLatest.weightKg==null?'—':bodyLatest.weightKg+'kg')+' · 腰围 '+(bodyLatest.waistCm==null?'—':bodyLatest.waistCm+'cm'):'记录体重和腰围，坚持测就能看到长期趋势';const bodyWeight=bodyLatest&&bodyLatest.weightKg!=null?bodyLatest.weightKg:'—';const bodyWeekAvg=bodyWeek.weightKg!=null?bodyWeek.weightKg+'kg':'未测';const bodyTrail=bodyInfo.trail||Array.from({length:7},(_,i)=>({date:shift(today,i-6),measured:false}));
const waterSrc=h.water||null;
const wi=categories.findIndex(c=>c.name==='饮水');
if(wi>=0)categories.splice(wi,1);
const order=c=>c.name==='心肺训练'?0:c.name==='抗阻训练'?1:c.name==='英文学习'?3:2;
categories.sort((a,b)=>order(a)-order(b));
const water=waterSrc?Object.assign({},waterSrc,{color:TOKENS.water,days:(waterSrc.days||[]).map(d=>Object.assign({},d,{
  // 倒序：今天在最上面，往下是昨天、前天……只在这几天之内往回看
  label:d.date===today?'今天':d.date===shift(today,-1)?'昨天':d.date.slice(5).replace('-','/')
}))}):null;
// 「这一杯」那条的圆点位置跟着当前选中的量走
if(water){water.cupMax=cupCeiling(water.targetMl);const cur=Number(this.data.waterChooseMl)||0;const pct=Math.min(100,Math.max(0,Math.round(cur/water.cupMax*1000)/10));water.choosePct=pct;water.knobPct=Math.min(97,Math.max(3,pct));}
const formatMean=v=>v==null?'—':Number(v).toFixed(1);
const bodyPrevious=bodyInfo.previousWeek||{};
const delta=(now,before,mult,unit)=>{if(now==null)return '本周暂无测量';if(before==null)return '暂无上周对比';const n=Math.round((now-before)*mult*10)/10;return n===0?'较上周 持平':'较上周 '+(n>0?'+':'−')+Math.abs(n)+(unit?' '+unit:'');};
const bodyCard={weight:formatMean(bodyWeek.weightKg),waist:formatMean(bodyWeek.waistCm),weightDelta:delta(bodyWeek.weightKg,bodyPrevious.weightKg,1,'kg'),waistDelta:delta(bodyWeek.waistCm,bodyPrevious.waistCm,10,'mm')};
const goals=h.goals||null;const weekLabel=weekRangeText(goals,today);
// 心肺卡展开只列「本周每条记录」：本月/本周多少分钟在周环上已经能看到，不再重复统计（用户 10-30）
const cWeekStart=mondayOf(today);
// 本周有氧单条记录（最新在上）：环上的「等效分钟」看汇总看不出构成，
// 列出来一眼就知道 29 分钟是哪几笔凑的；点一条进详情页，那里能改也能删（2026-10-30）
const INT_LABEL={low:'低强度 · 不计入',moderate:'中等强度',vigorous:'高强度 · 按 2 倍计'};
// 抗阻的强度只描述「练到什么程度」，不折算也不排除：低强度同样算一次训练（2026-10-30 用户：
// 低强度也是练了，总比不练强，要鼓励）。不能复用有氧那套「不计入 / 按 2 倍计」的标签。
const STRENGTH_INT_LABEL={low:'低强度',moderate:'中等强度',vigorous:'高强度'};
const fmtMin=s=>s?String(Math.round(s/6)/10):'0';
const cardioWeekLog=records.filter(a=>a.date>=cWeekStart&&a.date<=today).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).map(a=>({id:a.id,type:a.type,label:(SPORTS.find(s=>s.type===a.type)||{}).label||'运动',symbol:(SPORTS.find(s=>s.type===a.type)||{}).symbol||'↗',when:logDateLabel(a.date,today),clock:clockLabel(a.occurredAt,zone),mins:fmtMin(a.durationSec),intLabel:INT_LABEL[a.intensity]||'中等强度'}));
// 抗阻卡展开后的本周记录：每笔带 id，行内直接「删除」（2026-10-30：所有训练记录可撤销）
const PART_LABEL={upper:'上肢',lower:'下肢',full:'全身'};
const strengthProject=habits.projects.find(p=>p.kind==='resistance');
const strengthWeekLog=((strengthProject&&strengthProject.weekRecords)||[]).map(c=>({id:c.id,when:logDateLabel(c.date,today),partLabel:PART_LABEL[c.part]||'力量训练',intLabel:STRENGTH_INT_LABEL[c.intensity]||'中等强度'}));
for(const c of categories)if(c.name==='抗阻训练')c.weekLog=strengthWeekLog;this.setData({habits,categories,water,cardio,weekLabel,bodyCard,cardioWeekLog,loaded:true,swipeId:'',swipeDx:0,swipeDragging:false,bodyText,bodyWeight,bodyWeekAvg,bodyTrail,habitMonthly:cells.filter(c=>c.active).length,cells,sports:sports.filter(s=>this.data.filter==='all'||s.type===this.data.filter),list:records.filter(a=>this.data.filter==='all'||a.type===this.data.filter).map(a=>({...a,label:SPORTS.find(s=>s.type===a.type).label,distance:a.type==='swimming'?String(a.distanceM):(a.distanceM/1000).toFixed(2),unit:a.type==='swimming'?'m':'km',timed:!!SPORTS.find(s=>s.type===a.type).minDuration})),monthlySessions:records.filter(a=>a.date.startsWith(this.data.month)).length,report:(()=>{const rep=todayReport(h);rep.card=shareCard(rep,this.data.quote);return rep;})(),...(()=>{const rs=ringSets(h);return {rings:rs,ring:rs[this.data.ringView],recordedToday:rs.recordedToday||0};})()});},
toggleCounter(e){const id=e.currentTarget.dataset.id;const c=this.data.categories.find(c=>c.id===id);if(c&&!c.counterHasGoal){wx.showToast({title:'请在具体项目中查看目标完成率',icon:'none'});return;}this.setData({['counterModes.'+id]:!this.data.counterModes[id]});this.render();},toggle(){this.setData({expanded:!this.data.expanded});},async retry(){try{if(!getApp().globalData.token)await login();await this.load(true);}catch(e){error(e);}},add(e){const type=e?.currentTarget?.dataset?.type;if(type){wx.navigateTo({url:'/pages/record/record?type='+type});return;}const items=OCR_ENABLED?['记录一次打卡','截图录入','新建打卡项目','新建类别']:['记录一次打卡','新建打卡项目','新建类别'];wx.showActionSheet({itemList:items,success:r=>{const choice=items[r.tapIndex];if(choice==='新建打卡项目')this.createProject();else if(choice==='新建类别')wx.navigateTo({url:'/pages/create/create?newCategory=1&only=1'});else if(choice==='截图录入')this.chooseProject(true);else wx.navigateTo({url:'/pages/record/record'});}});},chooseProject(ocr=false){const projects=(this.data.habits?.projects||[]).filter(p=>!ocr||p.sportType);if(!projects.length){wx.showModal({title:'先建立你的项目',content:ocr?'截图录入需要先建立一个运动项目。':'建立你想坚持的项目后，就可以开始打卡。',confirmText:'去建立',success:r=>{if(r.confirm)this.createProject();}});return;}wx.navigateTo({url:'/pages/select/select?ocr='+(ocr?'1':'0')});},createProject(e){const categoryId=e?.currentTarget?.dataset?.id;wx.navigateTo({url:'/pages/create/create'+(categoryId?'?categoryId='+categoryId:'')});},
  // 列表末尾那个常驻入口：直接开「新建项目」，不经过弹出菜单（用户 10-29 找不到建新习惯的地方）
  addHabit(){wx.navigateTo({url:'/pages/create/create'});},category(e){const id=e.currentTarget.dataset.id;const category=this.data.categories.find(c=>c.id===id);if(!category)return;if(category.name==='抗阻训练'||category.preset==='resistance'){wx.navigateTo({url:'/pages/record/record?mode=strength'});return;}if(category.name==='心肺训练'||category.preset==='cardio'){wx.navigateTo({url:'/pages/record/record?mode=cardio'});return;}if(category.name==='英文学习'){this.learn();return;}if(!category.projects.length&&category.preset&&category.preset!=='cardio'){wx.navigateTo({url:'/pages/create/create?preset='+category.preset});return;}if(category.expandable){this.setData({['openCategories.'+id]:!this.data.openCategories[id]});this.render();return;}if(category.directProjectId){wx.navigateTo({url:'/pages/project/project?id='+category.directProjectId});return;}if(category.preset){wx.navigateTo({url:'/pages/create/create?preset='+category.preset});return;}this.setData({['openCategories.'+id]:!this.data.openCategories[id]});this.render();},toggleCardExpand(e){const id=e.currentTarget.dataset.id;if(!id)return;this.setData({['openCategories.'+id]:!this.data.openCategories[id]});this.render();},learn(){wx.navigateTo({url:'/pages/learn/learn'});},project(e){const project=this.data.habits.projects.find(p=>p.id===e.currentTarget.dataset.id);if(project?.kind==='learning'){this.learn();return;}wx.navigateTo({url:'/pages/project/project?id='+e.currentTarget.dataset.id});},async addSport(e){const id=e.currentTarget.dataset.id;const category=this.data.categories.find(c=>c.id===id);if(!category)return;const list=category.quickSports||[];if(!list.length)return wx.showToast({title:'五种心肺运动都已添加',icon:'none'});wx.showActionSheet({itemList:list.map(s=>s.label),success:r=>{const sport=list[r.tapIndex];if(sport)this.quickSport({currentTarget:{dataset:{category:id,type:sport.type,label:sport.label}}});}});},async quickSport(e){const {category,type,label}=e.currentTarget.dataset;try{await api('/projects','POST',{categoryId:category,name:label,sportType:type,kind:'sport',goal:{period:'weekly',target:3}});change();await this.load(true);wx.showToast({title:'已添加「'+label+'」',icon:'none'});}catch(err){error(err);}},async quickAction(e){const p=this.data.habits.projects.find(p=>p.id===e.currentTarget.dataset.id);if(!p)return;if(p.todayCheckinId||p.todayRecordId)return this.undoToday(p);await this.checkinNow(p);},async projectAction(e){const p=this.data.habits.projects.find(p=>p.id===e.currentTarget.dataset.id);if(!p)return;const action=e.currentTarget.dataset.action;if(action==='record'){wx.navigateTo({url:'/pages/record/record?projectId='+p.id+'&type='+p.sportType});return;}if(action==='checkin'){await this.checkinNow(p);return;}this.undoToday(p);},async checkinNow(p){try{let amount;// 分钟目标的项目：打卡时问一句练了多久，进度按分钟累加
if(p.metric==='duration'){const r=await new Promise(res=>wx.showModal({title:'练了多久？',editable:true,placeholderText:'分钟数，如 30',success:res}));if(!r||!r.confirm)return;amount=Number((r.content||'').trim());if(!Number.isFinite(amount)||amount<=0||amount>1440)return wx.showToast({title:'请填写 1–1440 的分钟数',icon:'none'});amount=Math.round(amount*10)/10;}
await api('/projects/'+p.id+'/checkins','POST',{date:this.today,confirmed:true,amount});change();await this.load(true);try{wx.vibrateShort&&wx.vibrateShort({type:'medium'});}catch(err){}clearTimeout(this._homeCelebrate);// 打卡后不再自动弹「今日闭环/分享」层：用户常常还有其他项目没打，不该被弹层打断；
// 想看细节点圆环，想分享点卡片右上角的「分享」。
this.setData({celebrate:{title:'已打卡',sub:'这一项完成啦'}});this._homeCelebrate=setTimeout(()=>this.setData({celebrate:null}),1100);}catch(e){error(e);}},undoToday(p){wx.showModal({title:'撤销今天的打卡？',content:'撤销后不可恢复，相关统计会重新计算。',confirmText:'撤销',success:async r=>{if(!r.confirm)return;try{await api((p.todayRecordId?'/activities/':'/checkins/')+(p.todayRecordId||p.todayCheckinId),'DELETE');change();await this.load(true);}catch(e){error(e);}}});},
// 抗阻卡展开后的逐条删除：抗阻没有编辑页，这里直接删（确认一次，防误触）
removeCheckin(e){const id=e.currentTarget.dataset.id;if(!id)return;wx.showModal({title:'删除这条抗阻记录？',content:'删除后不可恢复，本周训练日会重新计算。',confirmText:'删除',success:async r=>{if(!r.confirm)return;try{await api('/checkins/'+id,'DELETE');change();this.closeSwipe();await this.load(true);}catch(err){error(err);}}});},
  /* 左滑删除（2026-10-30）：下拉列表里每条记录左滑，右侧滑入「删除」块。
     手势只接管横滑——先判方向，竖向滑动照旧交给页面滚动，不抢滚动。
     只让按钮滑进来、行内文字不位移：原先整行左推会把「上肢」这种短标题推出可视区，
     滑动过程中看着像内容丢了（截图验证过，不好）。 */
  swipeStart(e){const id=e.currentTarget.dataset.id;if(!id)return;const t=e.touches[0];this._sw={id,x:t.clientX,y:t.clientY,base:this.data.swipeId===id?this.data.swipeDx:0,axis:null};},
  swipeMove(e){const s=this._sw;if(!s)return;const t=e.touches[0];const dx=t.clientX-s.x,dy=t.clientY-s.y;
    if(!s.axis){if(Math.abs(dx)<6&&Math.abs(dy)<6)return;s.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';if(s.axis==='x')this.setData({swipeId:s.id,swipeDx:s.base,swipeDragging:true});}
    if(s.axis!=='x')return;
    let r=s.base-dx;if(r<0)r=0;if(r>this.data.swipeW+16)r=this.data.swipeW+16;
    this.setData({swipeDx:Math.round(r)});},
  swipeEnd(){const s=this._sw;this._sw=null;if(!s||s.axis!=='x')return;
    const open=this.data.swipeDx>this.data.swipeW/2;
    this.setData({swipeDragging:false,swipeDx:open?this.data.swipeW:0});
    if(!open)this.laterClearSwipe(s.id);},
  /* 收回要等 0.2s 的滑出动画走完再摘掉节点，否则会「啪」地消失 */
  laterClearSwipe(id){clearTimeout(this._swClear);this._swClear=setTimeout(()=>{if(this.data.swipeId===id)this.setData({swipeId:'',swipeDx:0});},220);},
  closeSwipe(){if(!this.data.swipeId)return;const id=this.data.swipeId;this.setData({swipeDx:0});this.laterClearSwipe(id);},
  /* 记录行本身：已经有行滑开时，点一下先收起（别误跳转）；没滑开才进详情改时间/距离 */
  openLog(e){const id=e.currentTarget.dataset.id;if(this.data.swipeId){this.closeSwipe();return;}if(!id)return;wx.navigateTo({url:'/pages/record/record?id='+id});},
  /* 有氧单条删除：与详情页同一个接口，删完周分钟数会重算 */
  removeActivity(e){const id=e.currentTarget.dataset.id;if(!id)return;wx.showModal({title:'删除这条运动记录？',content:'删除后不可恢复，本周分钟数会重新计算。',confirmText:'删除',success:async r=>{if(!r.confirm)return;try{await api('/activities/'+id,'DELETE');change();this.closeSwipe();await this.load(true);}catch(err){error(err);}}});},
  ocr(){if(!OCR_ENABLED)return;this.chooseProject(true);},filter(e){this.setData({filter:e.currentTarget.dataset.type});this.render();},month(e){this.setData({month:e.detail.value.slice(0,7)});this.retry();},moveMonth(e){const y=+this.data.month.slice(0,4),m=+this.data.month.slice(5);const d=new Date(Date.UTC(y,m-1+Number(e.currentTarget.dataset.step),1));this.setData({month:d.toISOString().slice(0,7)});this.retry();},view(e){this.setData({view:e.currentTarget.dataset.view});},detail(e){wx.navigateTo({url:'/pages/record/record?id='+e.currentTarget.dataset.id});},account(){wx.navigateTo({url:'/pages/account/account'});},openBody(){wx.navigateTo({url:'/pages/body/body'});},body(){this.openBody();},_isoNow(){const d=new Date(),mins=-d.getTimezoneOffset();const off=(mins>=0?'+':'-')+String(Math.floor(Math.abs(mins)/60)).padStart(2,'0')+':'+String(Math.abs(mins)%60).padStart(2,'0');return new Date(d.getTime()+mins*60000).toISOString().slice(0,19)+off;},dockSame(){/* 2026-11-02 定稿：已在首页点「打卡」就停在本页，不再自动开记录页 */},
  // 饮水两段式：拖圆点只选「这一杯」的量（本地预览，50ml 一档），松手不写库；
  // 点右边的水滴才真正记一笔，走 POST /projects/:id/water 的「累加」语义 ——
  // 选错了重拖就行，来回拖动不会改坏今天已经记下的量。
  waterDragStart(e){
    const w=this.data.water;
    if(!w||this.data.waterBusy)return;
    this._dragging=true;this._pendingX=e.touches[0].clientX;
    // 每次按下都重新量位置（页面滚动后 rect 会变）
    wx.createSelectorQuery().in(this).select('.water-cup').boundingClientRect(rect=>{
      if(!rect){this._dragging=false;return;}
      this._sliderRect=rect;
      this.waterDragTo(this._pendingX);
    }).exec();
  },
  waterDragMove(e){ if(this._dragging)this.waterDragTo(e.touches[0].clientX); },
  waterDragTo(x){
    const r=this._sliderRect,w=this.data.water;
    if(!r||!w)return;
    const ratio=Math.min(1,Math.max(0,(x-r.left)/r.width));
    const ml=Math.round(ratio*(w.cupMax||1000)/50)*50;
    if(this._dragMl===ml)return;
    this._dragMl=ml;
    this.setData({waterChooseMl:ml,waterDragging:true,waterDragMl:ml,waterDragX:Math.round(Math.min(94,Math.max(6,ratio*100)))});
    this.syncWaterKnob(ml);
  },
  waterDragEnd(){
    if(!this._dragging)return;
    this._dragging=false;
    this._dragMl=null;
    this.setData({waterDragging:false});
  },
  // 圆点位置 = 选中量 / 单次上限；不写库，只改视图
  syncWaterKnob(ml){
    const w=this.data.water;
    if(!w||!w.cupMax)return;
    const pct=Math.min(100,Math.max(0,Math.round(ml/w.cupMax*1000)/10));
    this.setData({['water.choosePct']:pct,['water.knobPct']:Math.min(97,Math.max(3,pct))});
  },
  // 点水滴 = 确认喝下这一杯（累加）。量还没选就不发请求，避免误触记 0
  async waterConfirm(){
    const w=this.data.water,ml=Number(this.data.waterChooseMl)||0;
    if(!w||this.data.waterBusy)return;
    if(!(ml>0))return wx.showToast({title:'先在圆的这边拖一个量',icon:'none'});
    const requestId='sip-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    try{
      this.setData({waterBusy:true});
      await api('/projects/'+w.projectId+'/water','POST',{date:this.today,amountMl:ml,requestId,confirmed:true});
      change();
      await this.load(true);
      try{wx.vibrateShort&&wx.vibrateShort({type:'light'});}catch(e){}
      wx.showToast({title:'已记 +'+ml+' ml',icon:'none'});
    }catch(e){error(e);}
    finally{this.setData({waterBusy:false});}
  },
  // 记错了整天空掉：不用滑块往回拖，收在 7 天明细里，避免误触
  waterClearAll(){
    const w=this.data.water;
    if(!w||!w.totalMl||this.data.waterBusy)return;
    wx.showModal({title:'清空今天的饮水？',content:'当前已记 '+w.totalMl+' ml，清空后今天归零。',confirmText:'清空',success:r=>{if(r.confirm)this.waterSetTotal(0);}});
  },
  async waterSetTotal(ml){
    const w=this.data.water;
    if(!w)return;
    const requestId='slider-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    try{
      this.setData({waterBusy:true});
      await api('/projects/'+w.projectId+'/water','PUT',{date:this.today,amountMl:ml,requestId,revision:w.revision||0,confirmed:true});
      change();
      await this.load(true);
      try{wx.vibrateShort&&wx.vibrateShort({type:'light'});}catch(e){}
      wx.showToast({title:ml===0?'今天的饮水已清空':'已记 '+ml+' ml',icon:'none'});
    }catch(e){error(e);}
    finally{this.setData({waterBusy:false});}
  },

  // 点圆环之外那行 = 展开最近 7 天，纯看，不改数据
  toggleWater(){ this.setData({waterOpen:!this.data.waterOpen}); },

  // 首页体测可以随手收起：分享前也会自动收起，避免体重腰围被截进分享图
  toggleBody(){
    const open=!this.data.bodyOpen;
    this.setData({bodyOpen:open});
    try{wx.setStorageSync&&wx.setStorageSync('somactive.bodyOpen',open);}catch(e){}
  },

  // 分享图只在预览弹层里那张真 canvas 上画：画布必须在屏幕上。
  // 离屏 canvas（wx.createOffscreenCanvas）画完导出是一张纯白图——真机踩过一次，
  // 所以这条路整个删掉，预览和发图共用同一个文件，只有一份版式、一条代码路径。
  // 导出细节（等帧、验字节、验 PNG 头、验解码、重试）全在 utils/canvas-export.js。
  openShare(){
    const card=this.data.report&&this.data.report.card;
    this.setData({shareOpen:true,shareImage:'',shareNote:'',shareDraft:card?.summary||'',shareQuote:card?.quote||this.data.quote});
    return this.generateShareImage();
  },

  closeShare(){
    this._shareGeneration=(this._shareGeneration||0)+1;this._shareCanvasNode=null;this._shareJobKey=null;
    this.setData({shareOpen:false,shareEditing:false});
  },

  // 图坏了就退回画布：画布上一直是画好的那张卡，看着还是对的
  // 点画布重画一次：节点没拿到 / 上一轮导出失败时的出口
  shareRetry(){ this.generateShareImage(); },

  shareImageError(){
    this._shareImage='';
    this.setData({shareImage:'',shareNote:'这张图没打开，可以直接转发卡片'});
  },

  // 存成图片：群里更容易被看见和转发的是一张图，而不是小程序卡片
  async saveShare(){
    const file=this.data.shareOpen&&this.data.report?await this.generateShareImage():this._shareImage;
    if(!file||typeof wx.saveImageToPhotosAlbum!=='function'){
      wx.showToast({title:'图片还在生成，稍等一下',icon:'none'});
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath:file,
      success:()=>wx.showToast({title:'已存到相册'}),
      fail:e=>{
        const msg=String(e&&e.errMsg||'');
        if(/auth|deny|authorize/i.test(msg)&&wx.showModal){
          wx.showModal({title:'需要相册权限',content:'打开「保存到相册」后，就能把这张图存下来发到群里。',confirmText:'去设置',
            success:r=>{if(r.confirm&&wx.openSetting)wx.openSetting();}});
          return;
        }
        wx.showToast({title:'保存失败，可以试试直接转发',icon:'none'});
      }
    });
  },

  // 拿预览面板里那张 canvas 的节点。setData 之后要等一帧节点才在，所以轮询几次。
  _shareCanvas(tries){
    if(this._shareCanvasNode)return Promise.resolve(this._shareCanvasNode);
    const left=typeof tries==='number'?tries:16;
    return new Promise(resolve=>{
      if(typeof wx==='undefined'||typeof wx.createSelectorQuery!=='function')return resolve(null);
      const ask=(n)=>{
        if(n<=0)return resolve(null);
        wx.createSelectorQuery().select('#shareCard').fields({node:true,size:true}).exec(res=>{
          const item=res&&res[0];
          if(item&&item.node){this._shareCanvasNode=item;return resolve(item);}
          setTimeout(()=>ask(n-1),60);
        });
      };
      ask(left);
    });
  },

  // 画好并导出成「确认能打开」的临时文件。画不出来返回 ''
  async generateShareImage(){
    const key=JSON.stringify({card:this.data.report&&this.data.report.card,draft:this.data.shareDraft,quote:this.data.shareQuote});
    if(this._shareImage&&this._shareCacheKey===key){this.setData({shareImage:this._shareImage});return this._shareImage;}
    if(this._shareJob){if(this._shareJobKey===key)return this._shareJob;await this._shareJob;return this.generateShareImage();}
    this._shareJobKey=key;
    const job=this._generateShareImage();this._shareJob=job;
    try{const file=await job;if(file)this._shareCacheKey=key;return file;}finally{if(this._shareJob===job)this._shareJob=null;}
  },
  async _generateShareImage(){
    this.setData({shareImage:''});
    const generation=(this._shareGeneration||0)+1;this._shareGeneration=generation;
    const base=this.data.report&&this.data.report.card;if(!base)return '';const c={...base,summary:this.data.shareDraft===undefined?base.summary:this.data.shareDraft,quote:this.data.shareQuote===undefined?base.quote:this.data.shareQuote};
    if(typeof wx==='undefined')return '';
    const item=await this._shareCanvas();
    if(!item||!item.node){this.setData({shareNote:'卡片还没准备好，点一下重试'});return '';}
    try{
      const node=item.node;
      const W=Math.max(1,Math.round(item.width||SHARE_W));
      const H=Math.max(1,Math.round(item.height||SHARE_H));
      const dpr=this._dpr();
      const bw=Math.round(W*dpr),bh=Math.round(H*dpr);
      if(node.width!==bw||node.height!==bh){node.width=bw;node.height=bh;}
      const ctx=node.getContext('2d');
      // 重置变换再画：同一块画布被画第二次时，缩放不会叠加
      const paint=()=>{
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,bw,bh);
        ctx.scale(dpr,dpr);
        paintShareCard(ctx,W,H,c);
      };
      paint();
      const out=await exportCanvas({wx,canvas:node,width:bw,height:bh,ctx,paint});
      if(!out.path){
        try{console.error('share card export failed',out.error);}catch(_){}
        this.setData({shareNote:'这张图没生成出来，可以直接转发卡片'});
        return '';
      }
      if(generation!==this._shareGeneration){if(out.path!==this._shareImage)this._dropShareFile(out.path);return '';}
      // 只删上一张，而且不能把刚导出的这张删了（路径有可能复用）
      if(out.path!==this._shareImage)this._dropShareFile(this._shareImage);
      this._shareImage=out.path;
      this.setData({shareImage:out.path,shareNote:''});
      return out.path;
    }catch(e){
      try{console.error('share card export failed',e&&e.errMsg||e);}catch(_){}
      this.setData({shareNote:'这张图没生成出来，可以直接转发卡片'});
      return '';
    }
  },

  _dpr(){try{return (wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync()).pixelRatio||2;}catch(e){return 2;}},
  // 沙盒里只留最新一张：旧的临时图删掉，别越积越多
  _dropShareFile(file){
    if(!file||typeof wx.getFileSystemManager!=='function')return;
    try{wx.getFileSystemManager().unlink({filePath:file,fail(){}});}catch(e){}
  },

  // 「SHARE」：先开面板把图画出来（canvas 必须上屏才画得出），
  // 图确认可用后才调起微信的「发送给朋友」；画不出来/不支持就停在这个面板上，
  // 用户还能点「发送到微信群」走卡片分享 —— 这条路永远通。
  // 注意：showShareImageMenu 必须等文件真的可读再调，否则微信拿到的是空文件，
  // 弹出来的就是一张破图（真机踩过）。
  shareNow(){return this.openShare();},
  shareNoop(){},
  beginShareEdit(){this.setData({shareEditing:true});},
  editShareSummary(e){this._shareGeneration=(this._shareGeneration||0)+1;this._shareCacheKey=null;this.setData({shareDraft:e.detail.value,shareImage:''});},
  async finishShareEdit(e){if(e?.detail?.value!==undefined)this.setData({shareDraft:e.detail.value});this.setData({shareEditing:false});await this.generateShareImage();},
  async shuffleShareQuote(){const q=pick();this._shareCacheKey=null;this.setData({shareEditing:false,shareQuote:q.text,shareImage:''});await this.generateShareImage();},
  async sendShareImage(){
    this.setData({shareOpen:true});
    if(typeof wx.showShareImageMenu!=='function'){await this.generateShareImage();this.setData({shareNote:'当前微信不支持直接发图，可存到相册后分享'});return;}
    const file=await this.generateShareImage();
    if(!file)return;
    // 先复制成沙盒里的固定图再交给系统分享菜单：临时文件刚写完就交过去，扩展读到的是破图
    const path=await stageForShare(wx,file);
    await new Promise(r=>setTimeout(r,60));
    wx.showShareImageMenu({path,
      success:()=>this.setData({shareOpen:false}),
      fail:e=>{
        const msg=String(e&&e.errMsg||'');
        if(/cancel/i.test(msg)){this.setData({shareOpen:false});return;}  // 用户自己取消
        // 模拟器/老基础库不支持发图 → 面板留着，给一句实话，直接点「发送到微信群」发卡片
        this.setData({shareNote:'这张图没发出去，可以直接转发卡片，或先存到相册'});
      }});
  },

  // 分享出去的是今日战报：标题只带完成项数和心肺时长，图片用画布生成
  onShareAppMessage(){
    this.toggleBodyCollapsed();
    const r=this.data.report;
    return {title:r?r.title:'Somarise · 每天一点点',path:'/pages/home/home',imageUrl:this._shareImage||undefined};
  },

  onShareTimeline(){
    const r=this.data.report;
    return {title:r?r.title:'Somarise · 每天一点点'};
  },

  toggleBodyCollapsed(){
    if(!this.data.bodyOpen)return;
    this.setData({bodyOpen:false});
    try{wx.setStorageSync&&wx.setStorageSync('somactive.bodyOpen',false);}catch(e){}
  },

  // 圆环管理：点首页圆环进来。详情 sheet 已去掉——它只是把首页圆环数据又列一遍，零增量；
  // 现在直接进编辑器（显示哪些 / 颜色 / 预览），才是点圆环该给的东西。
  // 点圆环不开新页面：直接在首页上浮一层编辑器，遮罩底下还是首页，才是「浮窗」
  ringManage(){
    this.setData({ringEditor:true});
  },
  ringEditorClose(e){
    this.setData({ringEditor:false});
    // 编辑器把这轮改过的视图跟着带回来：先就地重画首页那组环（指头一松就是新的），
    // 再去 /home 对一次账。不这么做要等一趟网络，关掉浮层还能看到旧环。
    const view=e&&e.detail&&e.detail.goals;
    if(view&&this.home){this.home.goals=view;if(getApp().globalData.home)getApp().globalData.home.goals=view;this.render();}
    if(getApp().globalData.dirty)this.load(); // 改过颜色/显隐就刷新首页那组环
  },

  // 本周一项数值目标都没有：直说闭不上环，指一条去定线的路，不替用户填数字
  goalManage(){
    wx.navigateTo({url:'/pages/goals/goals'});
  },

  switchRing(e){
    const view=e.currentTarget.dataset.view;
    if(view===this.data.ringView)return;
    const sets=this.data.rings||{};
    this.setData({ringView:view,ring:sets[view]||null});
  }
});
