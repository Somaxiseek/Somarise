'use strict';
// 把本地演示服务清回「刚装好」的样子：删掉 SQLite 里的演示库，下次启动会重新播种。
// 想在小程序里一键回到新人状态，用「我的 → 重置为新人状态」，不用跑这个脚本。
//
//   npm run reset          只清数据（服务停掉后手动 npm start）
//   npm run reset -- -r    清完立刻把服务重新拉起来
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {execFileSync}=require('node:child_process');

const file=path.join(__dirname,'..','.local','demo.sqlite');
const restart=process.argv.includes('-r')||process.argv.includes('--restart');

let stopped=false;
try{
  execFileSync('/bin/sh',['-c','lsof -ti:8787 | xargs kill 2>/dev/null'],{stdio:'ignore'});
  stopped=true;
}catch(e){ /* 没有在跑就算了 */ }

if(fs.existsSync(file))fs.rmSync(file);
console.log(stopped?'已停掉本地服务（8787）':'本地服务本来没在跑');
console.log('已清空演示数据：'+path.relative(process.cwd(),file));
console.log('下次启动会重新播种两个空的虚构用户（demo-a / demo-b）。');

if(restart){
  const child=spawn(process.execPath,[path.join(__dirname,'..','server','http.js')],{
    cwd:path.join(__dirname,'..'),detached:true,stdio:'ignore'
  });
  child.unref();
  console.log('已重新启动：http://127.0.0.1:8787');
}else{
  console.log('启动服务：npm start');
}
