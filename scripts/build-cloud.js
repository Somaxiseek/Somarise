'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const root=path.join(__dirname,'..'),dest=path.join(root,'cloudfunctions/somactiveApi');
const files=['server/coach-access.js','server/coach-links.js','server/coach-days.js','server/coach-board.js','server/domain.js','server/habits.js','server/body.js','server/learning.js','server/goals.js','server/ocr.js','server/ocr-parse.js','server/mobile-gateway.js','miniprogram/utils/sports.js','miniprogram/utils/hydration.js','miniprogram/utils/tokens.js','miniprogram/utils/palette.js','miniprogram/utils/guidelines.js','miniprogram/utils/rings.js','miniprogram/utils/srs.js','miniprogram/utils/wordlink.js','miniprogram/data/words.js','miniprogram/data/words-lines.js','miniprogram/data/words/foot.js','miniprogram/data/words/anatomy.js','miniprogram/data/words/joint.js','miniprogram/data/words/gym.js','miniprogram/data/words/training.js','miniprogram/data/words/nutrition.js','miniprogram/data/words/health.js','miniprogram/data/words/mind.js','miniprogram/data/words/daily.js','miniprogram/data/words/common.js','miniprogram/data/words/science.js','miniprogram/data/words/philosophy.js','miniprogram/data/words/ref.js','miniprogram/data/cats.js','miniprogram/data/roots.js','miniprogram/data/parts-auto.js'];
const hashes={};for(const file of files){const source=path.join(root,file),target=path.join(dest,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');}
// 只复制不清理会让删掉的模块（例如已废弃的 difficulty.js）留在包里被一起上传。
// 只清理本脚本管理的两个目录，index.js / package.json 是手写的，保留。
const keep=new Set(files.map(f=>path.join(dest,f)));
const stale=[];
function sweep(dir){
  if(!fs.existsSync(dir))return;
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name);
    if(fs.statSync(p).isDirectory()){sweep(p);if(!fs.readdirSync(p).length)fs.rmdirSync(p);continue;}
    if(!keep.has(p)){fs.rmSync(p);stale.push(path.relative(dest,p));}
  }
}
sweep(path.join(dest,'server'));sweep(path.join(dest,'miniprogram'));
fs.writeFileSync(path.join(dest,'source-manifest.json'),JSON.stringify(hashes,null,2)+'\n');
console.log('手机测试云函数包已生成；未上传或部署。'+(stale.length?`（已清理 ${stale.length} 个废弃文件：${stale.join(', ')}）`:''));
