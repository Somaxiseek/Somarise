'use strict';
// 找微信开发者工具的命令行入口。
//
// 现实情况：一台机器上可能装了两份（/Applications 和移动硬盘里的 /Volumes/xxx/Applications），
// 而且只有「正在运行的那一份」的 CLI 能连上它的服务端口——另一份会读到自己的旧端口文件，
// 报一句「工具的服务端口已关闭」，让人误以为是端口没开。
// 所以这里按顺序探活：谁 islogin 通，就用谁。
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const SUFFIX=path.join('Contents','MacOS','cli');

function candidates(){
  const out=[];
  if(process.env.WECHAT_DEVTOOLS_CLI)out.push(process.env.WECHAT_DEVTOOLS_CLI);
  out.push(path.join('/Applications/wechatwebdevtools.app',SUFFIX));
  let vols=[];
  try{vols=fs.readdirSync('/Volumes');}catch(e){}
  for(const v of vols)out.push(path.join('/Volumes',v,'Applications/wechatwebdevtools.app',SUFFIX));
  return out.filter(p=>{try{return fs.statSync(p).isFile();}catch(e){return false;}});
}

function alive(cli){
  try{
    const out=execFileSync(cli,['islogin'],{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','ignore']});
    return /"login"\s*:\s*true/.test(out);
  }catch(e){return false;}
}

let cached=null;
function cliPath(){
  if(cached)return cached;
  const list=candidates();
  if(!list.length)throw new Error('没找到微信开发者工具，请先安装，或用 WECHAT_DEVTOOLS_CLI 指定 cli 路径');
  const hit=list.find(alive);
  if(!hit)throw new Error('找到了开发者工具但都没登录/没启动：先打开工具并登录，再重试\n  '+list.join('\n  '));
  cached=hit;
  return hit;
}

function run(args,opts){
  const cli=cliPath();
  console.log('$ '+path.basename(path.dirname(path.dirname(path.dirname(cli))))+' cli '+args.join(' '));
  return execFileSync(cli,args,{encoding:'utf8',timeout:(opts&&opts.timeout)||300000,stdio:['ignore','pipe','pipe']});
}

module.exports={cliPath,candidates,run};
