#!/usr/bin/env node
'use strict';
// 上线前自检：把「会卡审核」「云端跑不起来」「包里混进测试残留」的问题一次挑出来。
// 用法：npm run preflight      有任何 ✗ 时退出码为 1。
// 只读检查，不改任何文件。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const app=path.join(root,'miniprogram');
const results=[];
const ok=(name,detail)=>results.push({level:'ok',name,detail});
const warn=(name,detail)=>results.push({level:'warn',name,detail});
const bad=(name,detail)=>results.push({level:'bad',name,detail});

function walk(dir,out=[]){
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name);
    const st=fs.statSync(p);
    if(st.isDirectory())walk(p,out);else out.push({p,size:st.size});
  }
  return out;
}
function readText(rel){const p=path.join(root,rel);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';}

// 1) 云端模式必须配环境 ID，否则手机端会落到「未配置」或局域网分支
const runtime=require(path.join(app,'config/runtime.js'));
if(runtime.cloudEnv&&/^[a-z0-9-]{4,}$/i.test(runtime.cloudEnv))ok('云环境已配置',`cloudEnv=${runtime.cloudEnv}`);
else bad('云环境未配置','发布版本必须走云开发：把环境 ID 填进 miniprogram/config/runtime.js 的 cloudEnv');

// 2) 局域网地址留着不影响云端（云端优先），但容易让人误判连的是哪套数据
if(runtime.apiBase&&/^http:\/\//.test(runtime.apiBase))warn('仍留着局域网地址',`apiBase=${runtime.apiBase}；云端模式下会被忽略，建议发布前清空`);
else ok('没有残留的局域网地址','apiBase 为空');

// 3) 个人主体不能做 UGC 社交：圈子/排行榜已整体下线（2026-10-30），
//    这里反过来守着——不许再出现社交页面
const removed=['pages/groups/groups','pages/leaderboard/leaderboard'];
const registered=JSON.parse(fs.readFileSync(path.join(app,'app.json'),'utf8')).pages||[];
const leaked=removed.filter(p=>registered.includes(p));
if(!leaked.length)ok('社交功能已下线','圈子/排行榜页面已删除，App 只做「记录 + 看见自己的变化」');
else bad('社交页面还在注册表里','个人主体不能做 UGC，删掉 app.json 里的 '+leaked.join('、'));

// 4) 云函数包必须和源码同步，否则线上跑的是旧逻辑
const dest=path.join(root,'cloudfunctions/somactiveApi');
const manifestPath=path.join(dest,'source-manifest.json');
if(!fs.existsSync(manifestPath)){bad('云函数包未生成','先执行 npm run build:cloud');}
else{
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const drift=[];
  for(const [rel,hash] of Object.entries(manifest)){
    const src=path.join(root,rel);
    if(!fs.existsSync(src)){drift.push(`${rel}（源码已删除）`);continue;}
    const now=crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
    if(now!==hash)drift.push(rel);
  }
  if(drift.length)bad('云函数包与源码不一致','重新执行 npm run build:cloud；有改动：'+drift.join(', '));
  else ok('云函数包与源码一致',`${Object.keys(manifest).length} 个文件哈希吻合`);

  const managed=['server','miniprogram'];
  const stray=[];
  for(const dir of managed){
    const base=path.join(dest,dir);
    if(!fs.existsSync(base))continue;
    for(const f of walk(base))if(!manifest[path.relative(dest,f.p)])stray.push(path.relative(dest,f.p));
  }
  if(stray.length)warn('云函数包有多余文件','会被一起上传：'+stray.join(', '));
  else ok('云函数包没有多余文件','只有清单里的模块');
}

// 5) 主包体积（微信上限 2MB，分包另算；这个项目没有分包）
// 词库数据（data/words.js、data/words/*、data/roots.js）只有服务端和云函数用，
// 已经在 project.config.json 的 packOptions.ignore 里排除，不会上传，所以不计入主包。
const pack=JSON.parse(readText('project.config.json')||'{}').packOptions||{};
const ignored=(pack.ignore||[]).map(x=>String(x.value||'').replace(/^\/+|\/+$/g,'')).filter(Boolean);
const isIgnored=rel=>ignored.some(v=>rel===v||rel.startsWith(v+'/'));
const files=walk(app).filter(f=>!isIgnored(path.relative(app,f.p).split(path.sep).join('/')));
const total=files.reduce((n,f)=>n+f.size,0);
const mb=total/1024/1024;
if(mb>1.9)bad('主包接近或超过 2MB',`当前 ${mb.toFixed(2)}MB，音频占 ${(files.filter(f=>f.p.includes('/audio/')).reduce((n,f)=>n+f.size,0)/1024/1024).toFixed(2)}MB`);
else if(mb>1.5)warn('主包偏大',`当前 ${mb.toFixed(2)}MB（上限 2MB）`);
else ok('主包体积正常',`${mb.toFixed(2)}MB / 2MB`);

// 6) 测试残留：本地服务地址（允许留在开发默认值里）、演示码（必须被 demo 模式包住）、调试输出
const devFiles=new Set(['app.js','config/runtime.js']);
const residual=[
  {re:/127\.0\.0\.1:8787|localhost:8787/,label:'本机服务地址',skip:rel=>devFiles.has(rel)},
  {re:/DEMO-MEMBER|本地测试码/,label:'演示邀请码',skip:(rel,text)=>text.includes('wx:if="{{demo}}"')},
  {re:/console\.log\(\s*['"`]debug/i,label:'调试输出',skip:()=>false}
];
const hits=[];
for(const f of files){
  if(!/\.(js|wxml|json)$/.test(f.p))continue;
  const rel=path.relative(app,f.p);
  const text=fs.readFileSync(f.p,'utf8');
  for(const rule of residual)if(rule.re.test(text)&&!rule.skip(rel,text))hits.push(`${rel}（${rule.label}）`);
}
if(hits.length)warn('存在测试残留',hits.join(', '));
else ok('没有测试残留','开发默认值只留在 app.js / runtime.js，演示码被 demo 模式包住');

// 7) 个人主体用不了的能力
const banned=[[/wx\.getWeRunData/,'微信运动步数（个人主体不可用）'],[/wx\.getUserProfile|wx\.getUserInfo/,'获取微信头像昵称（会触发隐私授权）'],[/wx\.requestPayment/,'微信支付（个人主体未开通）']];
const bannedHits=[];
for(const f of files){
  if(!/\.js$/.test(f.p))continue;
  const text=fs.readFileSync(f.p,'utf8');
  for(const [re,label] of banned)if(re.test(text))bannedHits.push(`${path.relative(app,f.p)}（${label}）`);
}
if(bannedHits.length)bad('调用了个人主体不可用的能力',bannedHits.join(', '));
else ok('没有调用受限能力','无步数、无微信头像昵称、无支付');

// 8) 健康类措辞：审核对「医疗承诺」很敏感
const wording=/诊断|治疗|疗效|处方|医学建议|改善.{0,4}疾病/g;
const wordingHits=[];
for(const f of files){
  if(!/\.(js|wxml)$/.test(f.p))continue;
  // 词库里的「治疗 / 诊断」是英文词条的中文释义（treatment / diagnosis），不是产品在承诺疗效，跳过
  if(/[\\/]data[\\/](words|roots)/.test(f.p))continue;
  const text=fs.readFileSync(f.p,'utf8');
  const m=text.match(wording);
  if(m)wordingHits.push(`${path.relative(app,f.p)}（${[...new Set(m)].join('/')}）`);
}
if(wordingHits.length)bad('出现医疗措辞',wordingHits.join(', '));
else ok('没有医疗措辞','未出现诊断/治疗/疗效等词');

// 9) app.json 里注册的页面必须真的存在
let appJson={};
try{appJson=JSON.parse(readText('miniprogram/app.json'));}catch(e){bad('app.json 无法解析',e.message);}
const missing=[];
for(const p of appJson.pages||[]){
  for(const ext of ['.js','.wxml'])if(!fs.existsSync(path.join(app,p+ext)))missing.push(p+ext);
}
if(missing.length)bad('有页面文件缺失',missing.join(', '));
else ok('页面文件齐全',`${(appJson.pages||[]).length} 个页面`);

// 10) 云端必须拒绝真实的 Somaxis 绑定（未接通的接口不能假装能用）
const gateway=readText('server/mobile-gateway.js');
if(/startsWith\('\/somaxis\/'\)\)?\s*fail\(/.test(gateway))ok('Somaxis 绑定在云端仍是关闭的','未接通的授权接口直接返回 503');
else bad('Somaxis 接口可能被放开','云端没有拦 /somaxis/*，未跑通的授权不能对外');

const icon={ok:'✓',warn:'!',bad:'✗'};
for(const r of results)console.log(`${icon[r.level]} ${r.name}${r.detail?'  —  '+r.detail:''}`);
const badCount=results.filter(r=>r.level==='bad').length;
const warnCount=results.filter(r=>r.level==='warn').length;
console.log(`\n${results.length-badCount-warnCount} 项通过 · ${warnCount} 项提醒 · ${badCount} 项必须处理`);
process.exit(badCount?1:0);
