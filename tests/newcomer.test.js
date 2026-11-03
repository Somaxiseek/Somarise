const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createApp}=require('../server/http');
function page(name,{api=async()=>{},globalData={},wx={}}={}){let definition;const app={globalData};const ctx={Page:p=>definition=p,getApp:()=>app,require:(id)=>id.includes('guidelines')?require('../miniprogram/utils/guidelines'):id.includes('hydration')?require('../miniprogram/utils/hydration'):id.includes('sports')?require('../miniprogram/utils/sports'):id.includes('report')?require('../miniprogram/utils/report'):id.includes('rings')?require('../miniprogram/utils/rings'):id.includes('badges')?require('../miniprogram/utils/badges'):id.includes('bodyseries')?require('../miniprogram/utils/bodyseries'):id.includes('speech')?{play:()=>true,stop(){}}:id.includes('tokens')?require('../miniprogram/utils/tokens'):id.includes('palette')?require('../miniprogram/utils/palette'):id.includes('reflections')?{pick:()=>({text:'t',author:'a',kind:'inspired'})}:({api,login:async()=>{},error:e=>{throw e;},change:()=>{app.globalData.dirty=true;}}),wx,getCurrentPages:()=>[{},{}],Date,Math,Number,String,Promise,Error,setTimeout,clearTimeout,console,intl:Intl};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages',name,name+'.js'),'utf8'),ctx);const p={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(x){for(const [k,v] of Object.entries(x)){const ks=k.split('.');let o=this.data;for(const q of ks.slice(0,-1))o=o[q];o[ks.at(-1)]=v;}}};return {p,app};}
// 端到端回归：刚注册 / 刚重置的账号（项目都没有数值目标）也必须能渲染
// 之前 render 里直接读 p.goal.period，goal 为 null 时首页会弹「Cannot read properties of null」
test('真实新人数据能渲染首页与项目页',async t=>{
 const {server,store}=createApp({memory:true});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 const base='http://127.0.0.1:'+server.address().port;
 const t2=await (await fetch(base+'/local-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:'demo-a'})})).json();
 const home=await (await fetch(base+'/home',{headers:{Authorization:'Bearer '+t2.token}})).json();
 const {p}=page('home',{api:async()=>home});
 p.data.month=home.stats.month;
 p.home=home;
 p.render();
 assert.ok(p.data.loaded);
 assert.ok(p.data.categories.length>=3);
 assert.equal(p.data.categories.find(c=>c.name==='心肺训练').counterHasGoal,false,'新人没有数值目标');
 assert.equal(p.data.ring.items.length>0,true);
 assert.deepEqual(p.data.rings.week.items.map(i=>i.key),['strength','water'],'周环：抗阻（默认项目，仅记录）+ 饮水周圈（未定线，仅记录），心肺要记过才出现');

 const project=home.habits.projects.find(x=>x.goal===null);
 const detail=await (await fetch(base+'/projects/'+project.id,{headers:{Authorization:'Bearer '+t2.token}})).json();
 const {p:pp}=page('project',{api:async()=>detail});
 pp.id=project.id;
 await pp.load();
 assert.equal(pp.data.goalText,'仅记录','只记录的项目详情页也要能打开');
});
