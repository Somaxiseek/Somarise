const {test}=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../server/http');
const {createGateway,EXPECTED_APPID}=require('../server/mobile-gateway');
const {resetUser}=require('../server/domain');

function gatewaySetup(){let data=new Map(),chain=Promise.resolve();const repository={transaction(fn){const task=chain.then(async()=>{const next=structuredClone(data);const result=await fn({get:async key=>next.get(key)||null,set:async(key,value)=>{next.set(key,structuredClone(value));}});data=next;return result;});chain=task.catch(()=>{});return task;}};const gateway=createGateway(repository);return {call:(openid,path,method='GET',body={})=>gateway({path,method,body},{APPID:EXPECTED_APPID,OPENID:openid}),data:()=>data};}
const ZONE='Asia/Shanghai';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const activity=id=>({type:'running',occurredAt:new Date(Date.now()-3600000).toISOString(),timeZone:ZONE,distanceM:3000,durationSec:1200,visibility:'private',confirmed:true,requestId:id});

async function httpSetup(t){
 const {server,store}=createApp({memory:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(p,method='GET',body,token)=>{const r=await fetch(base+p,{method,headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 return {request,a:(await request('/local-session','POST',{userId:'demo-a'})).data.token,b:(await request('/local-session','POST',{userId:'demo-b'})).data.token};
}

test('重置只清当前账号：记录、目标、项目、圈子、绑定都回到空，另一个账号不受影响',async t=>{
 const {request,a,b}=await httpSetup(t);
 // 先把 demo-a 用脏：打卡 + 设目标 + 建圈子 + 教练绑定
 await request('/activities','POST',activity('reset-1'),a);
 await request('/goals','PATCH',{key:'cardio',target:90,applyNow:true},a);
 await request('/somaxis/link','POST',{code:'DEMO-MEMBER-001',consent:true},a);
 const group=(await request('/groups','POST',{},a)).data;
 const bActivity=await request('/activities','POST',activity('reset-2'),b);
 assert.ok(bActivity.data.id);
 let home=(await request('/home','GET',null,a)).data;
 assert.equal(home.activities.length,1,'重置前确实有记录');
 assert.equal(home.groups.length,1);
 assert.ok(home.link);

 const reset=await request('/reset','POST',{},a);
 assert.equal(reset.status,200);
 assert.equal(reset.data.ok,true);

 home=(await request('/home','GET',null,a)).data;
 assert.equal(home.activities.length,0,'记录清空');
 assert.equal(home.groups.length,0,'圈子关系清空');
 assert.equal(home.link,null,'教练绑定解除');
 const goals=(await request('/goals','GET',null,a)).data;
 assert.equal(goals.all.some(g=>g.key==='cardio'),false,'重置前设的心肺目标没了');
 assert.equal(goals.all.filter(g=>g.period==='weekly'&&!g.recordOnly&&Number(g.target)>0).length,0,'周目标回到「还没定线」（饮水周圈跟每日目标走，也不在）');
 assert.equal(home.habits.achievements.recordDays,0);
 const badges=(await request('/badges','GET',null,a)).data.badges;
 assert.equal(badges.every(m=>m.closed===0&&m.done===false),true,'月度奖章全部熄灭');

 // 另一个账号一条都没少
 const other=(await request('/home','GET',null,b)).data;
 assert.equal(other.activities.length,1,'只清自己，不动别人');
 assert.ok(group.id);
});

test('重置后是「刚进来」的样子：默认项目还在，但没有任何目标与记录',async t=>{
 const {request,a}=await httpSetup(t);
 await request('/activities','POST',activity('reset-3'),a);
 await request('/reset','POST',{},a);
 const home=(await request('/home','GET',null,a)).data;
 const names=home.habits.categories.map(c=>c.name).sort();
 assert.deepEqual(names,['心肺训练','抗阻训练','饮水'].sort());
 assert.ok(home.habits.projects.every(p=>p.progress.total===0),'项目都在，但没有记录');
 assert.equal(home.goals.recordedToday,0);
 assert.deepEqual(home.goals.week.map(it=>it.key),['strength','water'],'重置后周环：抗阻（默认项目，仅记录）+ 饮水周圈（未定线，仅记录）');
});

test('没有登录不能重置',async t=>{
 const {request}=await httpSetup(t);
 assert.equal((await request('/reset','POST',{})).status,401);
});

test('云上也能重置：清掉自己的记录，圈子里其他人的不受影响',async()=>{
 const {call}=gatewaySetup();
 const saved=(await call('a','/activities','POST',activity('cloud-1'))).data;
 assert.ok(saved.id);
 const group=(await call('a','/groups','POST',{name:'测试圈'})).data;
 await call('b','/groups/join','POST',{invite:group.invite});
 await call('b','/activities','POST',activity('cloud-2'));
 const reset=await call('a','/reset','POST');
 assert.equal(reset.status,200);
 assert.equal(reset.data.ok,true);
 const home=(await call('a','/home')).data;
 assert.equal(home.activities.length,0);
 assert.equal(home.groups.length,0);
 assert.equal((await call('b','/home')).data.activities.length,1,'别人的记录还在');
});

test('resetUser 只动这个人，不删账号本身',()=>{
 const db={users:[{id:'u1',nickname:'A',timeZone:'Asia/Shanghai',ringConfig:['x'],leaderboardOptIn:true},{id:'u2',nickname:'B',timeZone:'Asia/Shanghai'}],
  activities:[{id:'a1',userId:'u1'},{id:'a2',userId:'u2'}],
  goals:[{id:'g1',userId:'u1'},{id:'g2',userId:'u2'}],
  groups:[{id:'g',ownerId:'u1'}],group_members:[{userId:'u1',groupId:'g'},{userId:'u2',groupId:'g'}],
  user_group_permissions:[{userId:'u1',groupId:'g'},{userId:'u2',groupId:'g'}],
  likes:[{id:'l1',activityId:'a1',userId:'u1'},{id:'l2',activityId:'a2',userId:'u2'}],
  somaxis_account_links:[{id:'s1',userId:'u1'}],categories:[{id:'c1',userId:'u1'}]};
 const user=resetUser(db,'u1',()=> '2026-10-28T00:00:00Z');
 assert.equal(user.id,'u1','账号还在，只是清空');
 assert.deepEqual(db.activities.map(a=>a.id),['a2']);
 assert.deepEqual(db.goals.map(g=>g.id),['g2']);
 assert.deepEqual(db.categories,[]);
 assert.deepEqual(db.groups,[]);
 // 自己建的圈子跟着解散，所以里面的成员关系也一并清掉（不留空壳圈子）
 assert.deepEqual(db.group_members,[]);
 assert.deepEqual(db.user_group_permissions,[]);
 assert.deepEqual(db.likes.map(l=>l.id),['l2']);
 assert.deepEqual(db.somaxis_account_links,[]);
 assert.deepEqual(user.ringConfig,['water','cardio','body']);
 assert.equal(user.leaderboardOptIn,false);
 assert.throws(()=>resetUser(db,'不存在'));
});
