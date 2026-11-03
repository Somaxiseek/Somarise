'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {Service,metric,fail,resetUser}=require('./domain');const {Habits}=require('./habits');const {Learning}=require('./learning');const {MockOCR,recognize}=require('./ocr');const {Goals,PRESET,BUILTIN,LABEL,PERIOD,METRIC,UNIT,CUSTOM_METRICS}=require('./goals');const {Body}=require('./body');
const EXPECTED_APPID='wx6b81913a5a90b3e0';
// 教练身份只由部署配置决定（server/coach-access.js），昵称、资料怎么填都不算
const accessOf=uid=>require('./coach-access').access(uid);
function identity(context){if(context.APPID!==EXPECTED_APPID||typeof context.OPENID!=='string'||!context.OPENID)fail('微信身份或小程序关联无效',401);return 'wx_'+createHash('sha256').update(context.APPID+':'+context.OPENID).digest('hex').slice(0,32);}
function empty(){return {users:[],activities:[],activity_sources:[{id:'manual',kind:'manual'},{id:'ocr',kind:'ocr'},{id:'ocr_mock',kind:'mock'},{id:'import_mock',kind:'mock'}],groups:[],group_members:[],user_group_permissions:[],likes:[],somaxis_account_links:[],categories:[],projects:[],checkins:[],water_entries:[],learning_days:[],word_cards:[],word_settings:[],body_metrics:[],goals:[]};}
// 首页响应瘦身（2026-11-02）：同一个项目会同时出现在 habits.projects 和 habits.categories[].projects 里，
// 而每个项目的 progress 都带一份 28 个点的 trail —— 同一串数据被序列化四次，实测占响应体 47%（35.9KB→16.9KB）。
// 首页只画 category.trail（category 自己那份保留），项目的 progress.trail 只被「类别缺失」的兜底分支读过，
// 那一处已改成按 progress.days 现算。waterSeen / waterVersions 是服务端防重复的台账，客户端从不读。
function slimProjects(projects){for(const p of projects||[]){if(!p)continue;delete p.waterSeen;delete p.waterVersions;if(p.progress)delete p.progress.trail;}return projects;}
const PRIVATE_FIELDS=['activities','categories','projects','checkins','water_entries','learning_days','word_cards','word_settings','body_metrics','goals'];
function unpack(data,groups,uid){const db=empty();if(data){db.users=[data.user];for(const key of PRIVATE_FIELDS)db[key]=data[key]||[];}else db.users=[{id:uid,nickname:'新成员',avatar:'',timeZone:'Asia/Shanghai',createdAt:new Date().toISOString(),ringConfig:['water','cardio','body'],difficulty:'medium',difficultyLog:[]}];for(const key of ['groups','group_members','user_group_permissions','likes'])db[key]=groups?.[key]||[];return db;}
function pack(db,uid){const out={user:db.users.find(u=>u.id===uid)};for(const key of PRIVATE_FIELDS)out[key]=db[key].filter(r=>r.userId===uid);return out;}
function route(service,habits,learning,body,uid,path,method,b){const url=new URL(path,'https://Somarise.invalid');const p=url.pathname;
 if(p==='/account-access'&&method==='GET')return require('./coach-access').access(uid);
 if(p==='/identity'&&method==='POST')return {user:service.user(uid),mode:'wechat-cloud'};
 if(p==='/home'&&method==='GET'){const overview=habits.overview(uid);overview.achievements=habits.goals.achievements(uid);slimProjects(overview.projects);return {user:service.user(uid),habits:overview,water:habits.waterRecent(uid),goals:habits.goals.view(uid),stats:service.summary(uid,url.searchParams.get('month'),url.searchParams.get('zone')),activities:service.records(uid).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).map(a=>({...a,metric:metric(a)})),groups:service.db.groups.filter(g=>service.db.group_members.some(m=>m.userId===uid&&m.groupId===g.id)),link:(service.db.somaxis_account_links||[]).find(l=>l.userId===uid)||null,body:body.homeSummary(uid),learningToday:learning.doneToday(uid),learningRecent:learning.recent(uid)}; }
 if(p==='/profile'&&method==='PATCH'){const u=service.user(uid);const tz=typeof b.timeZone==='string'&&b.timeZone?b.timeZone:u.timeZone;service.summary(uid,null,tz);if(typeof b.nickname!=='string'||!b.nickname.trim()||b.nickname.length>30)fail('昵称须为1–30字');u.nickname=b.nickname.trim();u.timeZone=tz;if(b.avatar!==undefined){const av=String(b.avatar||'');if(av&&!/^px:[a-z]{2,12}$/.test(av))fail('头像无效');u.avatar=av;}if(b.leaderboardOptIn!==undefined){if(typeof b.leaderboardOptIn!=='boolean')fail('开关无效');u.leaderboardOptIn=b.leaderboardOptIn;}if(b.ringConfig!==undefined)u.ringConfig=service.validateRingConfig(uid,b.ringConfig);if(b.ringColors!==undefined)u.ringColors=service.validateRingColors(b.ringColors);if(b.difficulty!==undefined){/* 难度整套已取消：目标改由 /goals 单独设置 */}service.save();return u;}
 if(p==='/records'&&method==='GET')return habits.goals.logbook(uid,Number(url.searchParams.get('limit'))||60,Number(url.searchParams.get('days'))||0);
 // 每日明细（教练端主视图）：按天摊开的体测 / 心肺 / 抗阻 / 饮水，饮水带完成百分比且不截到 100%
 if(p==='/days'&&method==='GET')return require('./coach-days').daily({service,habits,goals:habits.goals,body},uid,url.searchParams.get('days'));
 // 教练总看板一格 / 个人页：日|周|月|年 的汇总与每日序列（server/coach-board.js）
 if(p==='/summary'&&method==='GET'){const o=require('./coach-board').optsOf(url.searchParams);return require('./coach-board').summary({service,habits,goals:habits.goals,body},uid,o.period,o);}
 if(p==='/person'&&method==='GET'){const o=require('./coach-board').optsOf(url.searchParams);return require('./coach-board').person({service,habits,goals:habits.goals,body},uid,o.period,o);}
 // 体测（体重/腰围）：本地 http.js 有四条，云端漏过一轮导致体验版体测页一直空着
 if(p==='/strength-project'&&method==='POST')return habits.ensureResistance(uid);
 if(p==='/body-metrics'&&method==='PUT')return body.record(uid,b);
 if(p==='/body-metrics'&&method==='GET')return body.list(uid,url.searchParams.get('weeks'));
 if(p==='/body-metrics/calendar'&&method==='GET')return body.calendar(uid);
 if(/^\/body-metrics\/[^/]+$/.test(p)&&method==='DELETE'){body.remove(uid,p.split('/')[2]);return {ok:true};}
 if(p==='/leaderboard'&&method==='GET')return service.leaderboard(uid,url.searchParams.get('period')||'month');
 if(p==='/badges'&&method==='GET')return service.badgesOf(uid);
 if(p==='/board'&&method==='GET')return service.board(uid,url.searchParams.get('metric')||'minutes');
 if(p==='/likes'&&method==='POST')return service.toggleLike(uid,b.activityId);
 if(p==='/activities'&&method==='POST'){const a=service.put(uid,b);habits.attachActivity(uid,a);return a;}
 if(/^\/activities\/[^/]+$/.test(p)&&method==='PUT')return service.put(uid,b,p.split('/')[2]);
 if(/^\/activities\/[^/]+$/.test(p)&&method==='DELETE'){service.remove(uid,p.split('/')[2]);return {ok:true};}
 if(p==='/goals'&&method==='GET'){const v=habits.goals.view(uid);const rows={};for(const key of habits.goals.keysOf(uid))rows[key]=habits.goals.current(uid,key);return {...v,all:habits.goals.list(uid).all,rows,ringColors:(service.user(uid).ringColors)||{},presets:PRESET,builtin:BUILTIN,labels:LABEL,periods:PERIOD,metrics:METRIC,units:UNIT,customMetrics:CUSTOM_METRICS,achievements:habits.goals.achievements(uid)};}
 if(p==='/goals'&&method==='PATCH')return habits.goals.setGoal(uid,b.key,b);
 if(p==='/goals/hidden'&&method==='PATCH')return b.scope==='week'?habits.goals.setWeekHidden(uid,b.key,b.hidden===true):habits.goals.setHidden(uid,b.key,b.hidden===true);
 if(p==='/goals/weekrule'&&method==='PATCH')return habits.goals.setWeekRule(uid,b.key,b.n===null?null:Number(b.n));
 if(p==='/reset'&&method==='POST'){resetUser(service.db,uid,()=>new Date().toISOString());service.save();return {ok:true,user:service.user(uid)};}
 if(p==='/categories'&&method==='POST')return habits.createCategory(uid,b);
 if(p==='/projects'&&method==='POST')return habits.createProject(uid,b);
 if(/^\/projects\/[^/]+$/.test(p)&&method==='GET')return habits.detail(uid,p.split('/')[2]);
 if(/^\/projects\/[^/]+\/checkins$/.test(p)&&method==='POST')return habits.checkin(uid,p.split('/')[2],b);
 if(/^\/checkins\/[^/]+$/.test(p)&&method==='DELETE'){habits.removeCheckin(uid,p.split('/')[2]);return {ok:true};}
 // 首页那颗水滴是「累加记一笔」（POST），饮水卡里的滑块是「改当日总量」（PUT）。
 // 之前只搬了 PUT，体验版点水滴直接掉到 fail('接口未开放') —— 跟体测那轮是同一个坑。
 if(/^\/projects\/[^/]+\/water$/.test(p)&&method==='POST')return habits.water(uid,p.split('/')[2],b);
 if(/^\/projects\/[^/]+\/water$/.test(p)&&method==='PUT')return habits.setWaterTotal(uid,p.split('/')[2],b);
 if(/^\/water\/[^/]+$/.test(p)&&method==='DELETE'){habits.removeWater(uid,p.split('/')[2]);return {ok:true};}
 if(p==='/learning/today'&&method==='GET')return learning.today(uid,Number(url.searchParams.get('extra'))||0);
 if(p==='/learning/vocab'&&method==='GET')return learning.vocab(uid);
 if(p==='/learning/review'&&method==='POST')return learning.review(uid,b);
 if(p==='/learning/touch'&&method==='POST')return learning.touch(uid,b);
 if(p==='/learning/park'&&method==='POST')return learning.park(uid,b);
 if(p==='/learning/unpark'&&method==='POST')return learning.unpark(uid,b);
 if(p==='/learning/new'&&method==='GET')return learning.newWords(uid,url.searchParams.get('offset'),url.searchParams.get('limit'));
 if(p==='/learning/reset'&&method==='POST')return learning.reset(uid);
 if(p==='/learning/settings'&&method==='PATCH')return learning.setSettings(uid,b);
 if(p==='/groups'&&method==='POST')return service.createGroup(uid,b.name);
 if(p==='/groups/join'&&method==='POST')return service.join(uid,b.invite);
 if(/^\/groups\/[^/]+$/.test(p)&&method==='GET')return service.group(uid,p.split('/')[2],url.searchParams.get('sort')||'monthly');
 if(/^\/groups\/[^/]+$/.test(p)&&method==='DELETE'){service.leave(uid,p.split('/')[2]);return {ok:true};}
 if(/^\/groups\/[^/]+\/permission$/.test(p)&&method==='PATCH'){service.permission(uid,p.split('/')[2],b.share);return {ok:true};}
 if(p.startsWith('/somaxis/'))fail('Somaxis真实授权连接尚未配置，暂不能绑定',503);
 fail('接口未开放',404);
}
// 教练会员：关联只由会员本人输入教练码授权建立（server/coach-links.js），
// 教练手填一个名字建不出账号，所以那条路已经删掉。
// 查看/代记时把请求「翻译」成以会员 uid 跑同一套 route，100% 复用目标/打卡/闭环口径。
async function serveMember(tx,memberUid,subPath,method,body){
  const own=await tx.get('user_'+memberUid);
  const db=unpack(own,{groups:[],group_members:[],user_group_permissions:[],likes:[]},memberUid);
  let dirty=!own;
  const service=new Service(db,()=>{dirty=true;});
  const habits=new Habits(service),learning=new Learning(habits),goals=new Goals(service,habits,learning);
  const bodyApi=new Body(service);bodyApi.habits=habits;habits.goals=goals;service._closedWeeks=uid=>goals.closedWeeks(uid);
  const value=route(service,habits,learning,bodyApi,memberUid,subPath,method,body);
  const next=pack(db,memberUid);
  if(dirty||!own)await tx.set('user_'+memberUid,next);
  return value;
}
async function handleCoach(tx,uid,rawPath,method,b){
  const raw=String(rawPath);
  const path=raw.split('?')[0];
  // 查询串要自己留着：/coach/members/:id/days?days=7 里的天数写在 query 上，
  // 前端走的是 cloudSend(path)，GET 没有 body
  const query=new URLSearchParams(raw.indexOf('?')<0?'':raw.slice(raw.indexOf('?')+1));
  if(path.indexOf('/coach/')!==0)return {handled:false};
  const links=require('./coach-links');
  const store={get:k=>tx.get(k),set:(k,v)=>tx.set(k,v)};
  const access=accessOf(uid);

  // 教练码：教练出示给会员的那串六位字符，只有教练本人能看/能换
  if(path==='/coach/invite'){
    if(!access.isCoach)fail('仅限已认证教练',403);
    if(method==='GET')return {handled:true,value:await links.issueCode(store,uid)};
    if(method==='POST')return {handled:true,value:await links.issueCode(store,uid,{rotate:true})};
    fail('接口未开放',404);
  }

  // 会员这一侧：看自己授权给了谁 / 授权 / 撤回。
  // 写的是共享表，route() 只认单个用户的私有数据，所以只能在这里做。
  if(path==='/coach/link'){
    if(method==='GET'){
      const link=await links.linkOf(store,uid);
      if(!link)return {handled:true,value:{link:null,coach:null}};
      const own=await tx.get('user_'+link.coachId);
      const coachName=(own&&own.user&&own.user.nickname)||'';
      // 教练的备注是教练视角的东西：会员侧读关联时剥掉，不能顺着 link 漏出去
      return {handled:true,value:{link:Object.assign({},link,{remark:undefined}),coach:{userId:link.coachId,name:coachName,active:accessOf(link.coachId).isCoach}}};
    }
    if(method==='POST'){
      if(!b||b.consent!==true)fail('要本人同意才能授权');
      const coachId=await links.coachByCode(store,b.code);
      if(!coachId)fail('教练码对不上，请跟你的教练再核对一次');
      if(!accessOf(coachId).isCoach)fail('这个教练码已停用，请向教练要一个新的');
      if(coachId===uid)fail('不能授权给自己');
      const own=await tx.get('user_'+uid);
      const nickname=(own&&own.user&&String(own.user.nickname||'').trim())||'';
      const name=String(b.name||'').trim()||(nickname&&nickname!=='新成员'?nickname:'');
      if(!name||name.length>30)fail('称呼须为 1–30 字');
      const link=await links.authorize(store,{memberUid:uid,coachId,name});
      return {handled:true,value:Object.assign({},link,{remark:undefined})};
    }
    if(method==='DELETE')return {handled:true,value:await links.revoke(store,uid)};
    fail('接口未开放',404);
  }

  // 总看板：横轴是人，一人一列；每个会员用 TA 自己的 uid 跑同一套 /summary
  if(path==='/coach/board'){
    if(!access.isCoach)fail('仅限已认证教练',403);
    if(method!=='GET')fail('接口未开放',404);
    const board=require('./coach-board');
    const period=query.get('period')||'week';
    const anchor=query.get('anchor')||'';
    const list=await links.membersOf(store,uid);
    const members=[];
    for(const link of list){
      const sub='/summary?period='+encodeURIComponent(period)+(anchor?'&anchor='+encodeURIComponent(anchor):'');
      const s=await serveMember(tx,link.memberUid,sub,'GET',{});
      members.push(Object.assign({id:link.id,name:link.name||'',remark:link.remark||'',memberUid:link.memberUid,authorizedAt:link.authorizedAt},s));
    }
    const first=members[0];
    return {handled:true,value:{
      period,
      range:first?{from:first.from,to:first.to,label:first.label,grain:first.grain}:null,
      members
    }};
  }

  const m=/^\/coach\/members(?:\/([^/]+))?(\/home|\/days|\/person|\/remark)?$/.exec(path);
  if(!m)fail('接口未开放',404);
  if(!access.isCoach)fail('仅限已认证教练',403);
  const memberId=m[1],sub=m[2];
  if(!memberId){
    if(method==='GET')return {handled:true,value:await links.membersOf(store,uid)};
    // 手填名字建不出账号：会员得自己在他的「我的 → 教练授权」里输入你的教练码
    if(method==='POST')fail('会员要自己在「我的 → 教练授权」里输入你的教练码，这里不能手动新建',400);
    fail('接口未开放',404);
  }
  const link=(await links.membersOf(store,uid)).find(x=>x.id===memberId);
  if(!link)fail('这位会员已解除授权',404);
  // 解除只断开关联：记录是会员自己的，教练没有删除权
  if(method==='DELETE')return {handled:true,value:await links.unlink(store,uid,memberId)};
  // 教练备注（用户 10-30）：微信昵称认不出人，教练自己记一个；只属于这条关联，会员看不到
  if(sub==='/remark'){
    if(method!=='PATCH')fail('接口未开放',404);
    return {handled:true,value:await links.setRemark(store,uid,memberId,b&&b.remark)};
  }
  // 教练是只读的（用户 10-29 定）：看得见就够了，替会员改目标、代记一笔这两条写入路径都撤了。
  // 会员的数据只能由会员本人写——教练这边连接口都不留，免得哪天又被翻出来。
  if(sub==='/home'&&method==='GET')return {handled:true,value:links.visibleHome(await serveMember(tx,link.memberUid,'/home','GET',{}))};
  // 每日明细：体测 / 心肺 / 抗阻 / 饮水，一天一行；饮水给毫升数和完成百分比（喝超了就是 125%）
  if(sub==='/days'&&method==='GET'){
    const days=query.get('days')||(b&&b.days)||30;
    return {handled:true,value:await serveMember(tx,link.memberUid,'/days?days='+encodeURIComponent(String(days)),'GET',{})};
  }
  // 个人页：五张卡 + 五项可左右滑的每日图，最短周期是周
  if(sub==='/person'&&method==='GET'){
    const period=query.get('period')||'week';
    const anchor=query.get('anchor')||'';
    const sub='/person?period='+encodeURIComponent(period)+(anchor?'&anchor='+encodeURIComponent(anchor):'');
    const value=await serveMember(tx,link.memberUid,sub,'GET',{});
    return {handled:true,value:Object.assign({id:link.id,name:link.name||'',remark:link.remark||'',memberUid:link.memberUid,authorizedAt:link.authorizedAt},value)};
  }
  fail('接口未开放',404);
}
function createGateway(repository,deps={}){return async(event,context)=>{try{const uid=identity(context);if(!event||typeof event.path!=='string'||event.path.length>300||!/^\/[a-z/0-9?=&%._-]+$/i.test(event.path))fail('请求路径无效');const method=event.method||'GET',b=event.body||{};if(typeof b!=='object'||Array.isArray(b))fail('请求格式无效');if(JSON.stringify(b).length>2900000)fail('请求过大',413);if(event.path==='/ocr'&&method==='POST'){
 // 手机上传的截图走云存储：客户端只交一个 fileID，云函数自己去下载、识别、删文件。
 // 这样调用的参数只有几十字节，不会再出现「几 MB 的 base64 打进去、真机上直接 fail」。
 if(typeof b.fileID==='string'&&b.fileID){if(b.fileID.length>300)fail('图片标识无效');if(typeof deps.ocrFile!=='function')fail('当前环境不支持图片识别，请手动填写',422);const out=await deps.ocrFile(b.fileID);if(!out||!out.draft)fail((out&&out.message)||'这张图没读到运动数据，换一张或手动填',422);return {status:200,data:{draft:out.draft,cleanupPending:!!out.cleanupPending}};}
 if(typeof b.image!=='string'||b.image.length>2800000)fail('图片须小于2MB');const bytes=Buffer.from(b.image,'base64');const imageHash=createHash('sha256').update(bytes).digest('hex');const result=await recognize(new MockOCR(),bytes);result.draft.imageHash=imageHash;return {status:200,data:result};}
 const result=await repository.transaction(async tx=>{const coach=await handleCoach(tx,uid,event.path,method,b);if(coach.handled)return coach.value;const own=await tx.get('user_'+uid);const groups=await tx.get('shared_groups')||{groups:[],group_members:[],user_group_permissions:[]};const originalGroups=JSON.stringify(groups);const db=unpack(own,groups,uid);let dirty=!own;const service=new Service(db,()=>{dirty=true;});const habits=new Habits(service),learning=new Learning(habits),goals=new Goals(service,habits,learning);const body=new Body(service);body.habits=habits;habits.goals=goals;service._closedWeeks=uid=>goals.closedWeeks(uid);const originalOwn=JSON.stringify(pack(db,uid));const path=new URL(event.path,'https://Somarise.invalid').pathname;
 if(/^\/groups\/[^/]+$/.test(path)&&method==='GET'){const groupId=path.split('/')[2];service.membership(uid,groupId);const peers=[...new Set(db.group_members.filter(m=>m.groupId===groupId&&m.userId!==uid).map(m=>m.userId))];if(peers.length>49)fail('体验版小组暂支持50名成员',413);for(const id of peers){const peer=await tx.get('user_'+id);if(peer){db.users.push(peer.user);db.activities.push(...(peer.activities||[]));}}}
 if(['/leaderboard','/board','/likes'].includes(path)){ // 圈子相关接口需要圈内成员的记录与资料（/likes 要校验对方那条打卡）
  const myGroups=[...new Set(db.group_members.filter(m=>m.userId===uid).map(m=>m.groupId))];
  const peerIds=new Set();for(const g of myGroups)for(const m of db.group_members)if(m.groupId===g&&m.userId!==uid)peerIds.add(m.userId);
  if(peerIds.size>99)fail('圈子榜暂支持最多100名圈内成员',413);
  for(const id of peerIds){const peer=await tx.get('user_'+id);if(peer){db.users.push(peer.user);db.activities.push(...(peer.activities||[]));db.water_entries.push(...(peer.water_entries||[]));db.projects.push(...(peer.projects||[]));}}
 }
 const value=route(service,habits,learning,body,uid,event.path,method,b);const next=pack(db,uid);if(dirty||JSON.stringify(next)!==originalOwn){if(Buffer.byteLength(JSON.stringify(next))>700000)fail('测试账号记录已达当前容量，请联系管理员',413);await tx.set('user_'+uid,next);}const nextGroups={groups:db.groups,group_members:db.group_members,user_group_permissions:db.user_group_permissions,likes:db.likes||[]};if(JSON.stringify(nextGroups)!==originalGroups){if(Buffer.byteLength(JSON.stringify(nextGroups))>700000)fail('体验小组数据达到当前容量',413);await tx.set('shared_groups',nextGroups);}return value;});return {status:200,data:result};
 }catch(e){return {status:e.status||500,data:{error:e.status?e.message:'云端服务暂不可用，请稍后重试'}};}};}
module.exports={createGateway,identity,EXPECTED_APPID,empty,route,slimProjects};
