// 包体守规：从客户端入口（app.js + app.json 页面 + usingComponents 组件）可达的代码，
// 不能 require 被 packOptions.ignore 排除出主包的文件 —— 词库正文（data/words.js、
// data/words/、data/roots.js）约 1.1MB，一直排除在主包外，词数据走云端接口。
// 谁在可达链上引了它，运行时就缺模块，页面会整个注册失败（2026-10-30 学习页/看板
// 全白，就是学习范围功能在 learn.js 里引了 data/words）。
// 注意 utils/wordlink.js 虽然 require 词库，但只被服务端引用，不在可达链上，不算违规。
'use strict';
const test=require('node:test');
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const mp=path.join(root,'miniprogram');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8'));
const ignored=(cfg.packOptions&&cfg.packOptions.ignore||[]).map(x=>x.value);

function resolveReq(fromFile,req){
  if(!req.startsWith('.'))return null;
  let abs=path.resolve(path.dirname(fromFile),req);
  if(fs.existsSync(abs)&&fs.statSync(abs).isDirectory())abs=path.join(abs,'index.js');
  if(!fs.existsSync(abs)&&fs.existsSync(abs+'.js'))abs+='.js';
  return fs.existsSync(abs)?abs:null;
}
function jsonComponents(file){
  try{const j=JSON.parse(fs.readFileSync(file,'utf8'));return Object.values(j.usingComponents||{});}
  catch(e){return [];}
}
function jsOf(jsonPath){
  return jsonPath.replace(/\.json$/,'.js');
}
// 入口可达闭包：app.js + 页面（含页面 json 引的组件，组件也引组件）
function reachableEntries(){
  const app=JSON.parse(fs.readFileSync(path.join(mp,'app.json'),'utf8'));
  const seeds=[path.join(mp,'app.js')];
  for(const p of app.pages||[]){
    const js=path.join(mp,p+'.js');
    if(fs.existsSync(js))seeds.push(js);
  }
  const seen=new Set();
  const queue=[...seeds];
  const compQueue=[];
  // 页面与组件的 json 都要扫 usingComponents
  const jsons=[...seeds.map(f=>f.replace(/\.js$/,'.json'))];
  for(const p of app.pages||[])jsons.push(path.join(mp,p+'.json'));
  while(jsons.length){
    const j=jsons.pop();
    if(!fs.existsSync(j))continue;
    for(const c of jsonComponents(j)){
      const cjs=path.join(mp,c+'.js');
      if(!seen.has(cjs)){seen.add(cjs);queue.push(cjs);jsons.push(path.join(mp,c+'.json'));}
    }
  }
  const reachable=new Set(seeds);
  while(queue.length){
    const f=queue.pop();
    if(!fs.existsSync(f))continue;
    const src=fs.readFileSync(f,'utf8');
    for(const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)){
      const abs=resolveReq(f,m[1]);
      if(abs&&!reachable.has(abs)){reachable.add(abs);queue.push(abs);}
    }
  }
  return reachable;
}

test('入口可达的客户端代码不引用被排除出主包的文件',()=>{
  const reachable=reachableEntries();
  const bad=[];
  for(const f of reachable){
    if(!f.endsWith('.js'))continue;
    const src=fs.readFileSync(f,'utf8');
    for(const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)){
      const abs=resolveReq(f,m[1]);
      if(!abs)continue;
      const rel=path.relative(mp,abs).split(path.sep).join('/');
      const hit=ignored.find(ig=>rel===ig||rel.startsWith(ig+'/'));
      if(hit)bad.push(`${path.relative(root,f)} → ${m[1]}（${hit} 被排除出主包）`);
    }
  }
  assert.deepEqual(bad,[],'可达代码不许 require 被排除的文件：\n'+bad.join('\n'));
});

test('分类表是独立小文件：学习范围功能只依赖 cats.js',()=>{
  const learn=fs.readFileSync(path.join(mp,'pages/learn/learn.js'),'utf8');
  assert.match(learn,/require\('\.\.\/\.\.\/data\/cats'\)/,'learn.js 应引 data/cats');
  assert.doesNotMatch(learn,/data\/words/,'learn.js 不许引整个词库');
  assert.ok(!ignored.includes('data/cats.js'),'cats.js 必须留在主包里');
  const cats=require(path.join(mp,'data/cats'));
  const words=require(path.join(mp,'data/words'));
  assert.deepEqual(cats.CATS,words.CATS,'cats.js 与 words.js 的分类表必须一致');
});
