'use strict';
// 切换「后端跑哪里」，只改 miniprogram/config/runtime.js 里的 cloudEnv。
//
//   node scripts/cloud-env.js <环境ID>   走云开发（体验版/真机都靠它，手机不需要和电脑同一个 Wi-Fi）
//   node scripts/cloud-env.js off        回到本机 8787（开发者工具里调试用，改代码最快）
//   node scripts/cloud-env.js            只看当前状态
const fs=require('node:fs');
const path=require('node:path');

const file=path.join(__dirname,'..','miniprogram','config','runtime.js');
const arg=(process.argv[2]||'').trim();

function read(){return fs.readFileSync(file,'utf8');}
function current(){
  const src=read();
  const env=(/cloudEnv\s*:\s*'([^']*)'/.exec(src)||[])[1]||'';
  const base=(/apiBase\s*:\s*'([^']*)'/.exec(src)||[])[1]||'';
  return {env,base};
}

if(!arg){
  const c=current();
  console.log('cloudEnv:',c.env||'(空)');
  console.log('apiBase :',c.base||'(空)');
  console.log(c.env?'→ 当前走云开发，连电脑的 8787 不会生效':'→ 当前走本机/局域网');
  process.exit(0);
}

const next=arg==='off'?'':arg;
if(next&&!/^[a-z0-9][a-z0-9-]{2,40}$/i.test(next)){
  console.error('环境 ID 长得不像：'+next+'\n云开发控制台里的形式类似 Somarise-trial-8gxxxxxx（不要带 https:// 或域名后缀）');
  process.exit(1);
}

let src=read();
if(/cloudEnv\s*:\s*'[^']*'/.test(src))src=src.replace(/cloudEnv\s*:\s*'[^']*'/,"cloudEnv:'"+next+"'");
else src=src.replace(/module\.exports\s*=\s*\{/,"module.exports={cloudEnv:'"+next+"',");
fs.writeFileSync(file,src);

const c=current();
console.log(next?'✔ cloudEnv 已设为 '+c.env:'✔ 已清空 cloudEnv');
if(next){
  console.log('  现在开发者工具也会走云开发（不再读本机 8787）。改完界面记得重新编译。');
  console.log('  下一步：npm run cloud:deploy   —— 把云函数推上去');
  console.log('          npm run upload -- 0.1.0 "首个体验版"  —— 上传体验版');
  console.log('  回到本机调试：node scripts/cloud-env.js off');
}else{
  console.log('  回到本机模式：开发者工具读 apiBase='+(c.base||'(空)'));
}
