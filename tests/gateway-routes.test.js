// 守卫：前端调用的每个接口，云函数网关都得有。
// 起因：/body-metrics 系列（体测）只在本地 server/http.js 里实现过，云网关漏了，
// 本地一切正常、体验版体测页却一直空着。这类「两套后端漂移」靠人肉对照查不出来。
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {Service,seed}=require('../server/domain');
const {Habits}=require('../server/habits');
const {Learning}=require('../server/learning');
const {Goals}=require('../server/goals');
const {Body}=require('../server/body');
const {route,empty}=require('../server/mobile-gateway');

// 扫 api() 的第一个参数，把拼出来的路径也还原成 /projects/:x/water 这种形态。
// 第一版只认字面量，于是 api('/projects/'+id+'/water') 整条被跳过，
// 结果云端漏了 POST 饮水累加，体验版点水滴就弹「接口未开放」。
function firstArg(src,start){
  let depth=0,q=null,out='';
  for(let i=start;i<src.length;i++){
    const ch=src[i];
    if(q){out+=ch;if(ch==='\\'){out+=src[++i];continue;}if(ch===q)q=null;continue;}
    if(ch==="'"||ch==='"'||ch==='`'){q=ch;out+=ch;continue;}
    if(ch==='('||ch==='['||ch==='{'){depth++;out+=ch;continue;}
    if(ch===')'){if(depth===0)break;depth--;out+=ch;continue;}
    if(ch===']'||ch==='}'){depth--;out+=ch;continue;}
    if(ch===','&&depth===0)break;
    out+=ch;
  }
  return out;
}

function splitTop(arg,sep){
  const out=[];let depth=0,q=null,cur='';
  for(let i=0;i<arg.length;i++){
    const ch=arg[i];
    if(q){cur+=ch;if(ch==='\\'){cur+=arg[++i];continue;}if(ch===q)q=null;continue;}
    if(ch==="'"||ch==='"'||ch==='`'){q=ch;cur+=ch;continue;}
    if(ch==='('||ch==='['||ch==='{')depth++;
    if(ch===')'||ch===']'||ch==='}')depth--;
    if(ch===sep&&depth===0){out.push(cur);cur='';continue;}
    cur+=ch;
  }
  out.push(cur);
  return out;
}

function pathsOf(arg){
  const parts=splitTop(arg,'+').map(s=>s.trim());
  const first=parts[0];
  if(/^(['"`])([\s\S]*)\1$/.test(first)){
    let p='';
    for(const part of parts){
      const lit=/^(['"`])([\s\S]*)\1$/.exec(part);
      if(lit){p+=lit[2];continue;}
      if(!p.endsWith('/'))p+='/';
      p+=':x'; // 表达式 → 占位一段
    }
    return [p];
  }
  // 表达式打头（api((cond?'/a/':'/b/')+id)）：把里面每个 / 开头的字面量都当候选路径
  const lits=[...arg.matchAll(/(['"`])(\/[^'"`]*)\1/g)].map(m=>m[2]);
  const tail=parts.length>1;
  return lits.map(s=>{
    if(!tail)return s;
    return (s.endsWith('/')?s:s+'/')+':x';
  });
}

function frontPaths(){
  const root=path.join(__dirname,'..','miniprogram');
  const out=new Set();
  (function walk(dir){
    for(const f of fs.readdirSync(dir)){
      const p=path.join(dir,f);
      if(fs.statSync(p).isDirectory()){walk(p);continue;}
      if(!f.endsWith('.js'))continue;
      const src=fs.readFileSync(p,'utf8');
      for(const m of src.matchAll(/\bapi\(\s*/g)){
        for(const raw of pathsOf(firstArg(src,m.index+m[0].length))){
          const u=raw.split('?')[0];
          if(!u.startsWith('/'))continue;
          if(u.endsWith('/'))continue;
          if(u.includes('${'))continue;
          out.add(u);
        }
      }
    }
  })(root);
  return [...out].sort();
}

function env(){
  const db=empty();
  // 云网关里 unpack() 会给新 openid 造一个这样的用户，这里照抄，否则一律「未登录」
  db.users=[{id:'demo-a',nickname:'新成员',avatar:'',timeZone:'Asia/Shanghai',createdAt:new Date().toISOString(),ringConfig:['water','cardio','body'],difficulty:'medium',difficultyLog:[]}];
  const s=new Service(db,()=>{});
  const habits=new Habits(s);const learning=new Learning(habits);
  const goals=new Goals(s,habits,learning);habits.goals=goals;
  const body=new Body(s);body.habits=habits;
  s._closedWeeks=uid=>goals.closedWeeks(uid);
  habits.ensureDefaults();
  return {s,habits,learning,body,uid:'demo-a'};
}

const METHODS=['GET','POST','PUT','PATCH','DELETE'];
// /ocr 在 createGateway 里单独处理（要读 event.image），不经过 route()
// /coach/* 同理：授权写在 shared_coach_* 共享表里，得在事务里读写，由 handleCoach 接管。
// 这几处不豁免就会一直红，但豁免本身不能变成盲区，所以各有专门的测试盯着：
//   /ocr                          → tests/habits-http.test.js（识别入口）
//   /coach/invite、/coach/link     → tests/coach-gateway.test.js（教练码与会员授权）
//   /coach/members*               → tests/coach-gateway.test.js（真 gateway + 内存事务仓库）
// 教练侧只留读接口：/home（周期看板）和 /days（每日明细）；改目标、代记一笔已撤。
const SPECIAL=new Set(['/ocr','/coach/invite','/coach/link','/coach/board','/coach/members','/coach/members/:x','/coach/members/:x/home','/coach/members/:x/days','/coach/members/:x/person','/coach/members/:x/remark']);

test('前端每个接口在云函数网关里都有对应处理',()=>{
  const list=frontPaths();
  assert.ok(list.length>15,'扫到的接口太少，扫描规则可能失效了：'+list.length);
  const e=env();
  const missing=[];
  for(const p of list){
    if(SPECIAL.has(p))continue;
    let handled=false,last='';
    for(const m of METHODS){
      try{
        route(e.s,e.habits,e.learning,e.body,e.uid,p,m,{});
        handled=true;break;
      }catch(err){
        last=err.message;
        if(/接口未开放/.test(err.message)&&err.status===404)continue;
        handled=true;break; // 参数校验/权限之类的报错说明路由是通的
      }
    }
    if(!handled)missing.push(p+'（'+last+'）');
  }
  assert.deepEqual(missing,[],'云网关缺少这些接口：\n  '+missing.join('\n  '));
});

test('拼接出来的路径也要能扫到',()=>{
  const list=frontPaths();
  // 扫描规则一旦退回「只认字面量」，这条就会红 —— 上面那条守规也就形同虚设了
  for(const p of ['/projects/:x/water','/water/:x','/checkins/:x','/activities/:x'])
    assert.ok(list.includes(p),'没扫到 '+p+'：\n'+list.join('\n'));
});

test('首页水滴的「记一笔」在云网关里能累加',()=>{
  const e=env();
  const p=e.habits.overview(e.uid).projects.find(x=>x.kind==='hydration');
  assert.ok(p,'默认应该有饮水项目');
  const today=e.habits.detail(e.uid,p.id).today;
  const one=route(e.s,e.habits,e.learning,e.body,e.uid,'/projects/'+p.id+'/water','POST',{date:today,amountMl:250,requestId:'t-1',confirmed:true});
  assert.equal(one.amountMl,250,'POST 走累加，不该掉到「接口未开放」');
  const two=route(e.s,e.habits,e.learning,e.body,e.uid,'/projects/'+p.id+'/water','POST',{date:today,amountMl:300,requestId:'t-2',confirmed:true});
  assert.equal(two.amountMl,300);
  const total=route(e.s,e.habits,e.learning,e.body,e.uid,'/projects/'+p.id+'/water','PUT',{date:today,amountMl:800,requestId:'t-3',revision:2,confirmed:true});
  assert.equal(total.mode,'daily-total','PUT 仍然是「改当日总量」');
});

test('体测四件事在云网关里都能用',()=>{
  const e=env();
  const put=route(e.s,e.habits,e.learning,e.body,e.uid,'/body-metrics','PUT',{date:'2026-10-28',weightKg:70.5});
  assert.equal(put.date,'2026-10-28');
  const list=route(e.s,e.habits,e.learning,e.body,e.uid,'/body-metrics','GET',{});
  assert.ok(Array.isArray(list.entries),'列表要能读回来');
  const cal=route(e.s,e.habits,e.learning,e.body,e.uid,'/body-metrics/calendar','GET',{});
  assert.ok(Array.isArray(cal.years),'日历要能读回来');
  const home=route(e.s,e.habits,e.learning,e.body,e.uid,'/home','GET',{});
  assert.ok(home.body&&home.body.latest,'首页要带上体测汇总，否则体测卡永远显示「—」');
});
