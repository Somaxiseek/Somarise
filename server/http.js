'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');const {randomUUID}=require('node:crypto');
const {Service,seed,metric,fail,hash,resetUser}=require('./domain');const {Habits}=require('./habits');const {Learning}=require('./learning');const {Body}=require('./body');
const {MockOCR,recognize}=require('./ocr');const {slimProjects}=require('./mobile-gateway');const {Goals,PRESET,BUILTIN,LABEL,PERIOD,METRIC,UNIT,CUSTOM_METRICS}=require('./goals');
// Loopback plus RFC1918 private ranges: the demo service may be reached from a
// phone on the same Wi-Fi during real-device preview. Public hosts stay blocked.
const ALLOWED_HOST=/^(127\.0\.0\.1|localhost|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
function createApp({memory=false}={}){
 const dir=path.join(__dirname,'../.local');if(!memory)fs.mkdirSync(dir,{recursive:true});const store=new DatabaseSync(memory?':memory:':path.join(dir,'demo.sqlite'));store.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');let db=JSON.parse(store.prepare('SELECT data FROM state WHERE id=1').get()?.data||'null')||seed();const save=()=>store.prepare('INSERT OR REPLACE INTO state VALUES(1,?)').run(JSON.stringify(db));const service=new Service(db,()=>{db=service.db;save();});const habits=new Habits(service);const learning=new Learning(habits);const body=new Body(service);body.habits=habits;save();habits.ensureDefaults();const goals=new Goals(service,habits,learning);habits.goals=goals;service._closedWeeks=uid=>goals.closedWeeks(uid);const sessions=new Map();let reads=0;
 const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');try{if(!ALLOWED_HOST.test(req.headers.host||''))fail('仅限本机或局域网访问',403);if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)fail('本地 API 不接受浏览器跨源请求',403);const url=new URL(req.url,'http://localhost');const p=url.pathname;if(p==='/coach-preview'&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'");res.end(fs.readFileSync(path.join(__dirname,'coach-preview.html')));return;}if(p==='/coach-preview.js'&&req.method==='GET'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'coach-preview.js')));return;}let b={};if(req.method!=='GET'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>3000000)fail('请求过大',413);}try{b=JSON.parse(raw||'{}');}catch{fail('JSON 格式无效');}}
 let result;if(p==='/local-session'&&req.method==='POST'){if(!['demo-a','demo-b'].includes(b.userId))fail('仅限虚构用户');const token=randomUUID();sessions.set(token,{role:'member',uid:b.userId,expires:Date.now()+86400000});result={token,user:service.user(b.userId),mode:'local-demo'};}
 else if(p==='/local-coach-session'&&req.method==='POST'){const token=randomUUID();sessions.set(token,{role:'coach',coachId:'fictional-coach-001',expires:Date.now()+3600000});result={token,mode:'local-demo',role:'coach'};}
 else{const session=sessions.get((req.headers.authorization||'').replace(/^Bearer /,''));if(!session||session.expires<Date.now())fail('请重新进入演示登录',401);const uid=session.uid;
 // 教练与会员：关联只由会员本人输入教练码授权建立（server/coach-links.js，与云端同一份逻辑）
 if(p.startsWith('/coach/')){
  const links=require('./coach-links');const store={get:async k=>db[k]||null,set:async(k,v)=>{db[k]=v;save();}};
  const onlyCoach=()=>{if(session.role!=='coach')fail('仅限已认证教练',403);return session.coachId;};
  if(p==='/coach/invite'){const cid=onlyCoach();result=req.method==='POST'?await links.issueCode(store,cid,{rotate:true}):await links.issueCode(store,cid);}
  else if(p==='/coach/link'){
   if(session.role!=='member')fail('教练会话不能给自己授权',403);
   if(req.method==='GET'){const link=await links.linkOf(store,uid);const coachUser=link?db.users.find(u=>u.id===link.coachId):null;result={link:link?Object.assign({},link,{remark:undefined}):null,coach:link?{userId:link.coachId,name:(coachUser&&coachUser.nickname)||'',active:true}:null};}
   else if(req.method==='POST'){if(b.consent!==true)fail('要本人同意才能授权');const cid=await links.coachByCode(store,b.code);if(!cid)fail('教练码对不上，请跟你的教练再核对一次');if(cid===uid)fail('不能授权给自己');const me=db.users.find(u=>u.id===uid);const name=(b.name||'').toString().trim()||((me&&me.nickname&&me.nickname!=='新成员')?me.nickname:'');if(!name||name.length>30)fail('称呼须为 1–30 字');const link=await links.authorize(store,{memberUid:uid,coachId:cid,name});result=Object.assign({},link,{remark:undefined});}
   else if(req.method==='DELETE')result=await links.revoke(store,uid);
   else fail('接口未开放',404);
  }
  else if(p==='/coach/members'&&req.method==='GET'){const cid=onlyCoach();result=await links.membersOf(store,cid);}
  else if(p==='/coach/members'&&req.method==='POST')fail('会员要自己在「我的 → 教练授权」里输入你的教练码，这里不能手动新建',400);
  else if(/^\/coach\/members\/[^/]+$/.test(p)&&req.method==='DELETE'){const cid=onlyCoach();result=await links.unlink(store,cid,p.split('/')[3]);}
  // 教练备注（用户 10-30）：微信昵称认不出人，教练自己记一个；只属于这条关联，会员看不到
  else if(/^\/coach\/members\/[^/]+\/remark$/.test(p)&&req.method==='PATCH'){const cid=onlyCoach();result=await links.setRemark(store,cid,p.split('/')[3],b.remark);}
  else if(p==='/coach/board'&&req.method==='GET'){
   const cid=onlyCoach();const board=require('./coach-board');
   const period=url.searchParams.get('period')||'week';const anchor=url.searchParams.get('anchor')||'';
   const list=await links.membersOf(store,cid);
   const members=list.map(link=>Object.assign({id:link.id,name:link.name||'',remark:link.remark||'',memberUid:link.memberUid,authorizedAt:link.authorizedAt},
     board.summary({service,habits,goals,body},link.memberUid,period,{anchor})));
   const first=members[0];
   result={period,range:first?{from:first.from,to:first.to,label:first.label,grain:first.grain}:null,members};
  }
  // 教练只读（用户 10-29）：改目标、代记一笔的写入接口已经撤掉，这里只剩看
  else if(/^\/coach\/members\/[^/]+\/(home|days|person)$/.test(p)){
   const cid=onlyCoach();const id=p.split('/')[3];const link=(await links.membersOf(store,cid)).find(m=>m.id===id);if(!link)fail('这位会员已解除授权',404);const mid=link.memberUid;
   if(/\/home$/.test(p)&&req.method==='GET'){const overview=habits.overview(mid);overview.achievements=goals.achievements(mid);result=links.visibleHome({user:service.user(mid),habits:overview,goals:goals.view(mid),activities:service.records(mid).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).map(a=>({...a,metric:metric(a)})),body:body.homeSummary(mid)});}
   else if(/\/days$/.test(p)&&req.method==='GET')result=require('./coach-days').daily({service,habits,goals,body},mid,url.searchParams.get('days'));
   else if(/\/person$/.test(p)&&req.method==='GET')result=Object.assign({id:link.id,name:link.name||'',remark:link.remark||'',memberUid:link.memberUid,authorizedAt:link.authorizedAt},require('./coach-board').person({service,habits,goals,body},mid,url.searchParams.get('period')||'week',{anchor:url.searchParams.get('anchor')||''}));
   else fail('接口未开放',404);
  }
  else fail('接口未开放',404);
 }
 else if(session.role!=='member')fail('教练会话不能访问成员操作',403);
 else if(p==='/home'&&req.method==='GET'){reads++;const overview=habits.overview(uid);overview.achievements=goals.achievements(uid);slimProjects(overview.projects);result={user:service.user(uid),habits:overview,water:habits.waterRecent(uid),goals:goals.view(uid),stats:service.summary(uid,url.searchParams.get('month'),url.searchParams.get('zone')),activities:service.records(uid).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).map(a=>({...a,metric:metric(a)})),groups:db.groups.filter(g=>db.group_members.some(m=>m.userId===uid&&m.groupId===g.id)),link:db.somaxis_account_links.find(l=>l.userId===uid)||null,body:body.homeSummary(uid),learningToday:learning.doneToday(uid),learningRecent:learning.recent(uid),reads};}
 else if(p==='/records'&&req.method==='GET')result=goals.logbook(uid,Number(url.searchParams.get('limit'))||60,Number(url.searchParams.get('days'))||0);
 // 每日明细：与云端同一份 server/coach-days.js
 else if(p==='/days'&&req.method==='GET')result=require('./coach-days').daily({service,habits,goals,body},uid,url.searchParams.get('days'));
 else if(p==='/account-access'&&req.method==='GET')result=require('./coach-access').access(uid);
 else if(p==='/strength-project'&&req.method==='POST')result=habits.ensureResistance(uid);
 else if(p==='/body-metrics'&&req.method==='PUT')result=body.record(uid,b);
 else if(p==='/body-metrics'&&req.method==='GET')result=body.list(uid,url.searchParams.get('weeks'));
 else if(p==='/body-metrics/calendar'&&req.method==='GET')result=body.calendar(uid);
 else if(/^\/body-metrics\/[^/]+$/.test(p)&&req.method==='DELETE'){body.remove(uid,p.split('/')[2]);result={ok:true};}
 else if(p==='/profile'&&req.method==='PATCH'){const u=service.user(uid);const tz=typeof b.timeZone==='string'&&b.timeZone?b.timeZone:u.timeZone;service.summary(uid,null,tz);if(typeof b.nickname!=='string'||!b.nickname.trim()||b.nickname.length>30)fail('昵称须为1–30字');u.nickname=b.nickname.trim();u.timeZone=tz;if(b.avatar!==undefined){const av=String(b.avatar||'');if(av&&!/^px:[a-z]{2,12}$/.test(av))fail('头像无效');u.avatar=av;}if(b.leaderboardOptIn!==undefined){if(typeof b.leaderboardOptIn!=='boolean')fail('开关无效');u.leaderboardOptIn=b.leaderboardOptIn;}if(b.ringConfig!==undefined)u.ringConfig=service.validateRingConfig(uid,b.ringConfig);if(b.ringColors!==undefined)u.ringColors=service.validateRingColors(b.ringColors);if(b.difficulty!==undefined){/* 难度整套已取消：目标改由 /goals 单独设置，这里不再改任何目标 */}save();result=u;}
 else if(p==='/leaderboard'&&req.method==='GET')result=service.leaderboard(uid,url.searchParams.get('period')||'month');
 else if(p==='/badges'&&req.method==='GET')result=service.badgesOf(uid);
 else if(p==='/board'&&req.method==='GET')result=service.board(uid,url.searchParams.get('metric')||'minutes');
 else if(p==='/likes'&&req.method==='POST')result=service.toggleLike(uid,b.activityId);
 else if(p==='/goals'&&req.method==='GET'){const v=goals.view(uid);const rows={};for(const key of goals.keysOf(uid))rows[key]=goals.current(uid,key);result={...v,all:goals.list(uid).all,rows,ringColors:(service.user(uid).ringColors)||{},presets:PRESET,builtin:BUILTIN,labels:LABEL,periods:PERIOD,metrics:METRIC,units:UNIT,customMetrics:CUSTOM_METRICS,achievements:goals.achievements(uid)};}
 else if(p==='/goals'&&req.method==='PATCH')result=goals.setGoal(uid,b.key,b);
 else if(p==='/goals/hidden'&&req.method==='PATCH')result=b.scope==='week'?goals.setWeekHidden(uid,b.key,b.hidden===true):goals.setHidden(uid,b.key,b.hidden===true);
 else if(p==='/goals/weekrule'&&req.method==='PATCH')result=goals.setWeekRule(uid,b.key,b.n===null?null:Number(b.n));
 // 演示用：把这个账号清回「刚进来」的样子（只影响当前这个虚构账号）
 else if(p==='/reset'&&req.method==='POST'){resetUser(db,uid);habits.ensureDefaults();save();result={ok:true,user:service.user(uid)};}
 else if(p==='/learning/today'&&req.method==='GET')result=learning.today(uid,Number(url.searchParams.get('extra'))||0);
 else if(p==='/learning/vocab'&&req.method==='GET')result=learning.vocab(uid);
 else if(p==='/learning/review'&&req.method==='POST')result=learning.review(uid,b);
 else if(p==='/learning/touch'&&req.method==='POST')result=learning.touch(uid,b);
 else if(p==='/learning/park'&&req.method==='POST')result=learning.park(uid,b);
 else if(p==='/learning/unpark'&&req.method==='POST')result=learning.unpark(uid,b);
 else if(p==='/learning/new'&&req.method==='GET')result=learning.newWords(uid,url.searchParams.get('offset'),url.searchParams.get('limit'));
 else if(p==='/learning/settings'&&req.method==='PATCH')result=learning.setSettings(uid,b);
 else if(p==='/learning/reset'&&req.method==='POST')result=learning.reset(uid);
 else if(p==='/categories'&&req.method==='POST')result=habits.createCategory(uid,b);
 else if(p==='/projects'&&req.method==='POST')result=habits.createProject(uid,b);
 else if(/^\/projects\/[^/]+$/.test(p)&&req.method==='GET')result=habits.detail(uid,p.split('/')[2]);
 else if(/^\/projects\/[^/]+$/.test(p)&&req.method==='PUT')result=habits.updateProject(uid,p.split('/')[2],b);
 else if(/^\/projects\/[^/]+\/checkins$/.test(p)&&req.method==='POST')result=habits.checkin(uid,p.split('/')[2],b);
 else if(/^\/projects\/[^/]+\/water$/.test(p)&&req.method==='POST')result=habits.water(uid,p.split('/')[2],b);
 else if(/^\/projects\/[^/]+\/water$/.test(p)&&req.method==='PUT')result=habits.setWaterTotal(uid,p.split('/')[2],b);
 else if(/^\/water\/[^/]+$/.test(p)&&req.method==='DELETE'){habits.removeWater(uid,p.split('/')[2]);result={ok:true};}
 else if(/^\/checkins\/[^/]+$/.test(p)&&req.method==='DELETE'){habits.removeCheckin(uid,p.split('/')[2]);result={ok:true};}
 else if(p==='/activities'&&req.method==='POST'){result=service.put(uid,b);habits.attachActivity(uid,result);}
 else if(/^\/activities\/[^/]+$/.test(p)&&req.method==='PUT')result=service.put(uid,b,p.split('/')[2]);
 else if(/^\/activities\/[^/]+$/.test(p)&&req.method==='DELETE'){service.remove(uid,p.split('/')[2]);result={ok:true};}
 else if(p==='/ocr'&&req.method==='POST'){if(typeof b.image!=='string'||b.image.length>2800000)fail('图片须小于2MB');let cleanupFailed=false;const bytes=Buffer.from(b.image,'base64');const imageHash=hash(bytes);result=await recognize(new MockOCR(),bytes,{scenario:b.scenario,onCleanupFailure:()=>{cleanupFailed=true;}});result.draft.imageHash=imageHash;result.cleanupPending=cleanupFailed;}
 else if(p==='/groups'&&req.method==='POST')result=service.createGroup(uid,b.name);
 else if(p==='/groups/join'&&req.method==='POST')result=service.join(uid,b.invite);
 else if(/^\/groups\/[^/]+$/.test(p)&&req.method==='GET')result=service.group(uid,p.split('/')[2],url.searchParams.get('sort')||'monthly');
 else if(/^\/groups\/[^/]+$/.test(p)&&req.method==='DELETE'){service.leave(uid,p.split('/')[2]);result={ok:true};}
 else if(/^\/groups\/[^/]+\/permission$/.test(p)&&req.method==='PATCH'){service.permission(uid,p.split('/')[2],b.share);result={ok:true};}
 else if(p==='/somaxis/link'&&req.method==='POST')result=service.link(uid,b.code,b.consent);
 else if(p==='/somaxis/link'&&req.method==='DELETE'){service.unlink(uid);result={ok:true};}
 else fail('接口不存在',404);
 }res.end(JSON.stringify(result));}catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:e.status?e.message:'本地服务错误'}));}});return {server,service,store};
}
if(require.main===module){const {server}=createApp();const host=process.env.HOST||'127.0.0.1';const lan=host==='0.0.0.0';
 server.listen(8787,host,()=>{console.log(lan?'Somarise本地模拟服务：0.0.0.0:8787（局域网可访问，仅虚构数据）':'Somarise本地模拟服务：http://127.0.0.1:8787（仅虚构数据）');
  if(lan){const os=require('node:os');const ips=Object.values(os.networkInterfaces()).flat().filter(n=>n&&n.family==='IPv4'&&!n.internal).map(n=>n.address);ips.forEach(ip=>console.log('  手机可访问地址：http://'+ip+':8787'));}});}
module.exports={createApp};
