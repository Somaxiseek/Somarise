'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {RULES,qualifies}=require('../miniprogram/utils/sports');
const {dateKey,monday,CARDIO_TYPES}=require('../miniprogram/utils/guidelines');
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function day(instant,zone){try{return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));}catch{fail('无效时区或时间');}}
function shift(d,n){return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
function validate(x,now=Date.now()){
 const rule=Object.hasOwn(RULES,x.type)?RULES[x.type]:null;if(!rule)fail('请选择有效运动类型');
 if(typeof x.timeZone!=='string'||!x.timeZone)fail('请选择时区');
 const parts=/^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{3})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(x.occurredAt||'');
 if(!parts||Number(parts[2])<1||Number(parts[2])>12||Number(parts[3])<1||Number(parts[3])>new Date(Date.UTC(+parts[1],+parts[2],0)).getUTCDate())fail('运动日期格式无效');
 if(typeof x.occurredAt!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(x.occurredAt)||!Number.isFinite(Date.parse(x.occurredAt))||Date.parse(x.occurredAt)>now)fail('运动时间无效或在未来');
 day(x.occurredAt,x.timeZone);
 // 强度：说法（能不能说完一句整话）在界面上，机器里只存三档。
 //   low       = VT1 以下，散步这类。只记「今天动过」，不计训练量，所以不要求时长和距离
 //   moderate  = VT1 附近，能聊天；vigorous = 说不出整句，按 2 倍折算
 const intensity=x.intensity==null?'moderate':x.intensity;
 if(['low','moderate','vigorous'].indexOf(intensity)<0)fail('强度无效');
 const low=intensity==='low';
 if(!Number.isInteger(x.distanceM)||x.distanceM<0||x.distanceM>rule.max||(x.type!=='swimming'&&x.distanceM%10!==0))fail('距离无效或超出合理范围');
 if(!Number.isInteger(x.durationSec)||x.durationSec<(low?0:1)||x.durationSec>172800)fail('时长须为 1–172800 秒');
 for(const [k,min,max] of [['heartRate',30,240],['cadence',1,300]])if(x[k]!=null&&(!Number.isInteger(x[k])||x[k]<min||x[k]>max))fail('心率或频率无效');
 if(x.stroke!=null&&(!['自由泳','蛙泳','仰泳','蝶泳','混合'].includes(x.stroke)||x.type!=='swimming'))fail('泳姿无效');
 if(!['private','groups'].includes(x.visibility))fail('可见范围无效');
 if(x.confirmed!==true)fail('请先确认数据');
 return {type:x.type,occurredAt:new Date(x.occurredAt).toISOString(),timeZone:x.timeZone,distanceM:x.distanceM,durationSec:x.durationSec,intensity,heartRate:x.heartRate??null,cadence:x.cadence??null,stroke:x.stroke??null,visibility:x.visibility,confirmed:true};
}
// 散步没有时长/距离，算不出配速，直接不给这个指标（页面按「散步」显示）
function metric(a){if(RULES[a.type].minDuration)return a.durationSec?{value:Math.round(a.durationSec/60*10)/10,unit:'分钟'}:null;if(!a.durationSec||!a.distanceM)return null;return a.type==='cycling'?{value:Math.round(a.distanceM/a.durationSec*3.6*100)/100,unit:'km/h'}:{value:Math.round(a.durationSec/a.distanceM*(a.type==='swimming'?100:1000)),unit:a.type==='swimming'?'秒/100m':'秒/km'};}
function stats(records,zone,now=new Date().toISOString(),month){const today=day(now,zone);month=month||today.slice(0,7);const days=[...new Set(records.filter(qualifies).map(a=>day(a.occurredAt,zone)))].sort();const set=new Set(days);let longest=0,run=0,prev;for(const d of days){run=prev&&shift(prev,1)===d?run+1:1;longest=Math.max(longest,run);prev=d;}let cursor=set.has(today)?today:shift(today,-1),current=0;while(set.has(cursor)){current++;cursor=shift(cursor,-1);}const recent=days.filter(d=>d>=shift(today,-27)&&d<=today).length;
// 年卡用的三个数：累计天数不受月份影响，年里程/年时长只算当年（分享「我的一年」时直接取）
const year=today.slice(0,4);const inYear=records.filter(a=>day(a.occurredAt,zone).startsWith(year));
return {month,days:days.filter(d=>d.startsWith(month)),monthly:days.filter(d=>d.startsWith(month)).length,current,longest,recent,rate:Math.round(recent/28*1000)/10,last:days.at(-1)||null,
 totalDays:days.length,yearDays:days.filter(d=>d.startsWith(year)).length,
 yearKm:Math.round(inYear.reduce((n,a)=>n+(Number(a.distanceM)||0),0)/100)/10,
 yearMinutes:Math.round(inYear.reduce((n,a)=>n+(Number(a.durationSec)||0),0)/60)};}
const hash=x=>createHash('sha256').update(x).digest('hex');
class Service{
 constructor(db,save=()=>{},clock=()=>new Date().toISOString()){this.db=db;this.save=save;this.clock=clock;}
 user(id){const u=this.db.users.find(u=>u.id===id);if(!u)fail('未登录',401);return u;}
 own(uid,id){this.user(uid);const a=this.db.activities.find(a=>a.id===id&&a.userId===uid);if(!a)fail('记录不存在',404);return a;}
 records(uid){this.user(uid);return this.db.activities.filter(a=>a.userId===uid);}
 put(uid,input,id){this.user(uid);const old=id?this.own(uid,id):null;const x=validate(input,Date.parse(this.clock()));const projectId=old?.projectId||input.projectId||null;if(projectId){const project=(this.db.projects||[]).find(p=>p.id===projectId&&p.userId===uid);if(!project||project.sportType!==x.type)fail('项目不存在或运动类型不匹配',403);}const source=old?.source||input.source||'manual';if(!['manual','ocr','ocr_mock','import_mock'].includes(source))fail('来源未接入');const externalId=old?.externalId||input.externalId||null;if(externalId&&(typeof externalId!=='string'||externalId.length>160))fail('外部 ID 无效');const fp=hash(JSON.stringify([uid,x.type,x.occurredAt,x.distanceM,x.durationSec]));const imageHash=old?.imageHash||input.imageHash||null;if(imageHash&&!/^[a-f0-9]{64}$/.test(imageHash))fail('图片指纹无效');const requestId=input.requestId;if(requestId&&(typeof requestId!=='string'||requestId.length>160))fail('请求ID无效');if(!id&&requestId){const prior=this.db.activities.find(a=>a.userId===uid&&a.requestId===requestId);if(prior){if(prior.fingerprint!==fp)fail('重复请求内容不同',409);return prior;}}
 if(this.db.activities.some(a=>a.userId===uid&&a.id!==id&&(a.fingerprint===fp||(imageHash&&a.imageHash===imageHash)||(externalId&&a.externalId===externalId&&a.source===source))))fail('发现重复运动记录',409);
 const a={...x,id:old?.id||randomUUID(),userId:uid,projectId,source,externalId,imageHash,requestId:old?.requestId||requestId||randomUUID(),fingerprint:fp,createdAt:old?.createdAt||this.clock(),updatedAt:this.clock(),revision:(old?.revision||0)+1};
 if(old&&input.revision!==old.revision)fail('记录已改变，请刷新后再编辑',409);
 if(old)this.db.activities.splice(this.db.activities.indexOf(old),1,a);else this.db.activities.push(a);this.save();return a;
 }
 remove(uid,id){const a=this.own(uid,id);this.db.activities.splice(this.db.activities.indexOf(a),1);this.save();}
 summary(uid,month,zone){const u=this.user(uid);if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('月份无效');return stats(this.records(uid),zone||u.timeZone,this.clock(),month);}
 membership(uid,gid){this.user(uid);const m=this.db.group_members.find(m=>m.userId===uid&&m.groupId===gid);if(!m)fail('仅限小组成员',403);return m;}
 createGroup(uid,name='我的圈子'){this.user(uid);if(name==null||name==='')name='我的圈子';if(typeof name!=='string'||!name.trim()||name.length>40)fail('小组名称须为1–40字');const g={id:randomUUID(),name:name.trim(),ownerId:uid,invite:randomUUID().replaceAll('-','').slice(0,16),timeZone:this.user(uid).timeZone,createdAt:this.clock()};this.db.groups.push(g);this.join(uid,g.invite);return g;}
 join(uid,invite){this.user(uid);const g=this.db.groups.find(g=>g.invite===invite);if(!g)fail('邀请码无效',404);if(!this.db.group_members.some(m=>m.userId===uid&&m.groupId===g.id)){this.db.group_members.push({id:randomUUID(),userId:uid,groupId:g.id,createdAt:this.clock()});this.db.user_group_permissions.push({userId:uid,groupId:g.id,share:false});this.save();}return g;}
 leave(uid,gid){this.membership(uid,gid);this.db.group_members=this.db.group_members.filter(m=>!(m.userId===uid&&m.groupId===gid));this.db.user_group_permissions=this.db.user_group_permissions.filter(m=>!(m.userId===uid&&m.groupId===gid));this.save();}
 permission(uid,gid,share){this.membership(uid,gid);if(typeof share!=='boolean')fail('授权无效');this.db.user_group_permissions.find(m=>m.userId===uid&&m.groupId===gid).share=share;this.save();}
 group(uid,gid,sort='monthly'){this.membership(uid,gid);if(!['monthly','current'].includes(sort))fail('排序无效');const g=this.db.groups.find(g=>g.id===gid);const members=this.db.group_members.filter(m=>m.groupId===gid).map(m=>({id:m.userId,nickname:this.user(m.userId).nickname}));const allowed=members.filter(m=>this.db.user_group_permissions.some(p=>p.groupId===gid&&p.userId===m.id&&p.share));const rows=allowed.map(m=>({...m,...stats(this.records(m.id),g.timeZone,this.clock())})).sort((a,b)=>b[sort]-a[sort]||a.id.localeCompare(b.id));rows.forEach((r,i)=>r.rank=i&&r[sort]===rows[i-1][sort]?rows[i-1].rank:i+1);const feed=this.db.activities.filter(a=>allowed.some(m=>m.id===a.userId)&&a.visibility==='groups').map(a=>({id:a.id,nickname:this.user(a.userId).nickname,type:a.type,occurredAt:a.occurredAt,distanceM:a.distanceM,durationSec:a.durationSec})).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,50);return {group:g,members,leaderboard:rows.map(r=>({id:r.id,nickname:r.nickname,monthly:r.monthly,current:r.current,rank:r.rank})),feed,sharing:this.db.user_group_permissions.find(p=>p.groupId===gid&&p.userId===uid).share};}
 link(uid,code,consent){this.user(uid);if(consent!==true||code!=='DEMO-MEMBER-001')fail('仅接受虚构绑定码及明确授权');if(this.db.somaxis_account_links.some(l=>l.memberId==='fictional-member-001'&&l.userId!==uid))fail('该虚构会员已绑定其他用户',409);this.db.somaxis_account_links=this.db.somaxis_account_links.filter(l=>l.userId!==uid);const link={id:randomUUID(),userId:uid,memberId:'fictional-member-001',coachId:'fictional-coach-001',scope:'stats:read',createdAt:this.clock(),consentedAt:this.clock()};this.db.somaxis_account_links.push(link);this.save();return link;}
 unlink(uid){this.user(uid);this.db.somaxis_account_links=this.db.somaxis_account_links.filter(l=>l.userId!==uid);this.save();}
 coachStats(coachId,memberId){const l=this.db.somaxis_account_links.find(l=>l.coachId===coachId&&l.memberId===memberId);if(!l)fail('未授权或已解除绑定',403);const zone=this.user(l.userId).timeZone;const records=this.records(l.userId);const today=day(this.clock(),zone);const recent=records.filter(a=>{const d=day(a.occurredAt,zone);return d>=shift(today,-27)&&d<=today;});const s=this.summary(l.userId);return {schemaVersion:1,generatedAt:this.clock(),timeZone:zone,window:{from:shift(today,-27),to:today},recent:s.recent,rate:s.rate,current:s.current,last:records.map(a=>day(a.occurredAt,zone)).sort().at(-1)||null,byType:Object.keys(RULES).map(type=>{const list=recent.filter(a=>a.type===type);return {type,count:list.length,distanceM:list.reduce((n,a)=>n+a.distanceM,0),durationSec:list.reduce((n,a)=>n+a.durationSec,0)};})};}
 // ── 闭环排行榜：范围 = 自己 + 所在小组的所有成员；只比闭环，不露任何具体数据 ──
 setLeaderboardOptIn(uid,on){const u=this.user(uid);if(typeof on!=='boolean')fail('开关无效');u.leaderboardOptIn=on;this.save();return u;}
 circle(uid){const ids=new Set([uid]);for(const m of this.db.group_members)if(m.userId===uid)for(const p of this.db.group_members)if(p.groupId===m.groupId)ids.add(p.userId);return [...ids].map(id=>{try{return this.user(id);}catch{return null;}}).filter(Boolean);}
 // ── 圈子：今日有氧榜（分钟 / 公里可切）+ 打卡动态 + 点赞；只露有氧量与时长，不露心率体重 ──
 likes(){if(!this.db.likes)this.db.likes=[];return this.db.likes;}
 board(uid,metric='minutes'){
  const me=this.user(uid);
  if(!['minutes','km'].includes(metric))fail('排序无效');
  const likes=this.likes(),members=this.circle(uid);
  const rows=members.map(u=>{
   const tz=u.timeZone||'Asia/Shanghai',today=day(this.clock(),tz);
   let sec=0,dist=0;
   for(const a of this.records(u.id))if(CARDIO_TYPES.includes(a.type)&&a.durationSec>0&&day(a.occurredAt,tz)===today){sec+=a.durationSec;dist+=a.distanceM;}
   return {userId:u.id,nickname:u.nickname,avatar:u.avatar||'',minutes:Math.round(sec/60),km:Math.round(dist/100)/10,active:sec>0,me:u.id===uid,optIn:u.leaderboardOptIn===true};
  });
  const ids=new Set(members.map(u=>u.id));
  const feed=(this.db.activities||[]).filter(a=>ids.has(a.userId)&&a.visibility==='groups')
   .sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,20)
   .map(a=>{const owner=members.find(u=>u.id===a.userId)||this.user(a.userId),mine=likes.filter(l=>l.activityId===a.id);
    return {id:a.id,userId:a.userId,nickname:owner.nickname,avatar:owner.avatar||'',type:a.type,label:(RULES[a.type]||{}).label||a.type,
     date:day(a.occurredAt,owner.timeZone||'Asia/Shanghai'),minutes:Math.round(a.durationSec/60),km:Math.round(a.distanceM/100)/10,
     likes:mine.length,liked:mine.some(l=>l.userId===uid),self:a.userId===uid};});
  const sorted=rows.filter(r=>r.optIn).sort((a,b)=>metric==='km'?b.km-a.km||b.minutes-a.minutes:b.minutes-a.minutes||b.km-a.km);
  return {metric,optIn:me.leaderboardOptIn===true,rows:sorted,self:rows.find(r=>r.me)||null,feed,memberCount:rows.length};
 }
 toggleLike(uid,activityId){
  this.user(uid);
  if(typeof activityId!=='string'||!activityId)fail('记录无效');
  const a=(this.db.activities||[]).find(a=>a.id===activityId);
  if(!a)fail('记录不存在',404);
  if(a.userId===uid)fail('不能给自己点赞');
  if(a.visibility!=='groups'||!this.circle(uid).some(u=>u.id===a.userId))fail('无权查看这条记录',403);
  const likes=this.likes(),old=likes.find(l=>l.activityId===activityId&&l.userId===uid);
  if(old)likes.splice(likes.indexOf(old),1);else likes.push({id:randomUUID(),activityId,userId:uid,createdAt:this.clock()});
  this.save();
  return {activityId,likes:likes.filter(l=>l.activityId===activityId).length,liked:!old};
 }
// ── 每日圆环可自己配：想放几项放几项，一个也行；隐藏不删数据 ──
validateRingConfig(uid,cfg){
 this.user(uid);
 if(!Array.isArray(cfg))fail('圆环配置无效');
 const catIds=new Set((this.db.categories||[]).filter(c=>c.userId===uid).map(c=>c.id));
 const seen=new Set();
 for(const k of cfg){
  if(typeof k!=='string'||!k)fail('圆环项无效');
  if(seen.has(k))fail('同一个项目不能放两个圈');
  seen.add(k);
  if(['water','cardio','body','learn'].indexOf(k)>=0)continue;
  if(k.indexOf('cat:')===0&&catIds.has(k.slice(4)))continue;
  fail('圆环项不存在或不能选：'+k);
 }
 return cfg.slice();
}
// ── 圆环颜色：用户级覆盖，key → 十六进制色值。默认色仍由 tokens 决定，
// 这里只存「用户改过的那几个」，没改的 key 不出现。传 null / 空对象即可清空。 ──
validateRingColors(cfg){
  if(cfg===null||cfg===undefined)return {};
  if(typeof cfg!=='object'||Array.isArray(cfg))fail('圆环颜色配置无效');
  const HEX=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const out={};
  for(const k of Object.keys(cfg)){
    const v=cfg[k];
    if(v===null||v===undefined||v===''||v==='default')continue; // 这一项恢复默认
    if(typeof v==='string'&&HEX.test(v)){
      const hex=v.toUpperCase();
      // #abc 展开成 #AABBCC：统一存 6 位，下游按完整色值比对才不会错位
      out[k]=hex.length===4?'#'+hex[1]+hex[1]+hex[2]+hex[2]+hex[3]+hex[3]:hex;
    }
    else fail('颜色格式无效：'+k);
  }
  return out;
}
// ── 周闭环：唯一口径在 server/goals.js（本周所有「设了目标的周目标」都达标）。
// Service 单独使用（如排行榜测试）时由外部注入 _closedWeeks；未注入时用兜底：
// 只看设了每周目标的自建/抗阻项目是否达标，不掺任何难度概念。 ──
closedWeeks(uid){const u=this.user(uid),tz=u.timeZone||'Asia/Shanghai',today=day(this.clock(),tz);
 if(this._closedWeeks)return this._closedWeeks(uid);
 const perProject=(this.db.projects||[]).filter(p=>p.userId===uid&&p.goal&&p.goal.period==='weekly'&&p.goal.target>0)
  .map(p=>({target:p.goal.target,days:new Set((p.progress&&p.progress.days||[]).filter(d=>d<=today))}));
 const first=[...perProject.flatMap(p=>[...p.days])].sort()[0];
 const closed=new Set();
 if(perProject.length&&first){
  let m=monday(first),n=0;
  while(m<=today&&n<520){
   const end=shift(m,6);
   if(end<=today&&perProject.every(p=>[...p.days].filter(d=>d>=m&&d<=end).length>=p.target))closed.add(m);
   m=shift(m,7);n++;
  }
 }
 return {closed,today,tz};
}
 leaderboard(uid,period='month'){
  const me=this.user(uid);
  if(!['month','year'].includes(period))fail('周期无效');
  const addD=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  const {closed:myClosed,today}=this.closedWeeks(uid);
  const start=period==='month'?today.slice(0,7)+'-01':today.slice(0,4)+'-01-01';
  const diff=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
  const streakOf=closed=>{let n=0,m=monday(today);if(!closed.has(m))m=addD(m,-7);while(closed.has(m)){n++;m=addD(m,-7);}return n;};
  // 周期内「已经过完」的周一开局周：周一不早于周期开始与注册周，且周日已过（没过完的周不计分母）
  const endedMondays=reg=>{const list=[];let m=monday(start);if(m<start)m=addD(m,7);let mr=monday(reg);if(mr<reg)mr=addD(mr,7);if(mr>m)m=mr;for(;m<=today&&addD(m,6)<=today;m=addD(m,7))list.push(m);return list;};
  const rows=this.circle(uid).map(u=>{
   const tz=u.timeZone||'Asia/Shanghai';
   const {closed}=this.closedWeeks(u.id);
   const reg=day(Date.parse(u.createdAt),tz);
   const mondays=endedMondays(reg);
   const closedIn=mondays.filter(m=>closed.has(m)).length;
   return {userId:u.id,nickname:u.nickname,avatar:u.avatar||'',timeZone:tz,
    closed:closedIn,days:mondays.length,rate:mondays.length?Math.round(closedIn/mondays.length*100):0,
    totalClosed:closed.size,streak:streakOf(closed),
    isNew:diff(reg,today)<3,me:u.id===uid,optIn:u.leaderboardOptIn===true};
  });
  const byRate=(a,b)=>b.rate-a.rate||b.totalClosed-a.totalClosed||b.streak-a.streak;
  const byTotal=(a,b)=>b.totalClosed-a.totalClosed||b.streak-a.streak;
  return {period,today,optIn:me.leaderboardOptIn===true,
   rate:rows.filter(r=>r.optIn).sort(byRate),
   totals:rows.filter(r=>r.optIn).sort(byTotal),
   self:rows.find(r=>r.me)||null};
 }
 // 月度成就奖章：当月每个（周一在当月的）自然周都闭环且周已过完，该月奖章点亮
 badgesOf(uid){
  const {closed,today}=this.closedWeeks(uid);
  const addD=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
  const year=today.slice(0,4),badges=[];
  for(let i=1;i<=12;i++){const key=year+'-'+(i<10?'0':'')+i,monds=[];let m=monday(key+'-01');if(m<key+'-01')m=addD(m,7);
   while(m.slice(0,7)===key){monds.push(m);m=addD(m,7);}
   badges.push({month:key,label:i+'月',weeks:monds.length,closed:monds.filter(x=>closed.has(x)).length,
    done:monds.length>0&&monds.every(x=>closed.has(x)&&addD(x,6)<=today)});
  }
  return {today,badges};
 }
}
function seed(){return {users:[{id:'demo-a',nickname:'虚构用户·小林',avatar:'',timeZone:'Asia/Shanghai',createdAt:new Date().toISOString(),ringConfig:['water','cardio','body']},{id:'demo-b',nickname:'虚构用户·小陈',avatar:'',timeZone:'Asia/Shanghai',createdAt:new Date().toISOString(),ringConfig:['water','cardio','body']}],activities:[],activity_sources:[{id:'manual',kind:'manual'},{id:'ocr',kind:'ocr'},{id:'ocr_mock',kind:'mock'},{id:'import_mock',kind:'mock'}],groups:[],group_members:[],user_group_permissions:[],likes:[],somaxis_account_links:[]};}
// ── 重置为「新人」：只清这一个人的东西，圈子里其他人的记录不受影响 ──
// 用来在演示/真机上看清第一次进来长什么样：记录、项目、目标、学习、体测、饮水、
// 圈子关系、点赞、教练绑定全部清空，个人设置回到初始值（不删账号本身）。
const OWNED_FIELDS=['activities','categories','projects','checkins','water_entries','learning_days','word_cards','word_settings','body_metrics','goals'];
function resetUser(db,uid,clock=()=>new Date().toISOString()){
 const user=db.users.find(u=>u.id===uid);if(!user)fail('未登录',401);
 for(const key of OWNED_FIELDS)if(Array.isArray(db[key]))db[key]=db[key].filter(r=>r.userId!==uid);
 // 自己建的圈子一起解散，否则重置后还能翻出旧圈子
 const owned=new Set((db.groups||[]).filter(g=>g.ownerId===uid).map(g=>g.id));
 db.groups=(db.groups||[]).filter(g=>!owned.has(g.id));
 db.group_members=(db.group_members||[]).filter(m=>m.userId!==uid&&!owned.has(m.groupId));
 db.user_group_permissions=(db.user_group_permissions||[]).filter(p=>p.userId!==uid&&!owned.has(p.groupId));
 db.likes=(db.likes||[]).filter(l=>l.userId!==uid);
 db.somaxis_account_links=(db.somaxis_account_links||[]).filter(l=>l.userId!==uid);
 user.ringConfig=['water','cardio','body'];user.leaderboardOptIn=false;user.createdAt=clock();
 return user;
}
module.exports={RULES,day,shift,validate,metric,stats,Service,seed,fail,hash,resetUser,OWNED_FIELDS};
