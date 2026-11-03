'use strict';
// 把单词读音传上微信云存储。
//
// 为什么要这个脚本：2957 个 m4a（约 24MB）塞不进 2MB 主包，必须外挂；
// 而微信开发者工具的 CLI 只有 env / functions 两个子命令，没有存储上传，
// 所以要么在云开发控制台手动拖，要么用腾讯云密钥走这里一行命令。
//
//   npm i -D @cloudbase/node-sdk
//   export TENCENTCLOUD_SECRET_ID=...
//   export TENCENTCLOUD_SECRET_KEY=...
//   node scripts/upload-audio-cloud.js --env cloud1-d5gz0w43l36c376a3 --dir outputs/audio-words --prefix somactive/audio
//
// 传完把打印出来的前缀填进 miniprogram/config/audio.js 的 AUDIO_BASE（末尾带斜杠）。
//
// 安全：密钥只从环境变量读，不写进仓库、不打印。传完记得 unset。
const fs=require('fs');
const path=require('path');

const argv=process.argv.slice(2);
const opt=(name,fallback)=>{const i=argv.indexOf('--'+name);return i>=0&&argv[i+1]?argv[i+1]:fallback;};
const dir=path.resolve(opt('dir',path.join(__dirname,'..','outputs','audio-words')));
const prefix=opt('prefix','somactive/audio').replace(/^\/+|\/+$/g,'');
const env=opt('env','');
const concurrency=Math.max(1,Number(opt('concurrency','8'))||8);

const secretId=process.env.TENCENTCLOUD_SECRET_ID||'';
const secretKey=process.env.TENCENTCLOUD_SECRET_KEY||'';

function die(msg){console.error('✗ '+msg);process.exit(1);}

if(!fs.existsSync(dir))die(`目录不存在：${dir}`);
if(!env)die('缺 --env（云开发环境 ID，例如 cloud1-xxxx）');
if(!secretId||!secretKey)die('缺密钥：请先 export TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY');

let cloudbase;
try{cloudbase=require('@cloudbase/node-sdk');}
catch{die('没装 @cloudbase/node-sdk，先跑 npm i -D @cloudbase/node-sdk');}

const files=fs.readdirSync(dir).filter(f=>f.endsWith('.m4a'));
if(!files.length)die(`${dir} 里没有 m4a`);

const app=cloudbase.init({env,secretId,secretKey});

async function main(){
  let done=0,failed=0;
  const queue=[...files];
  async function worker(){
    while(queue.length){
      const name=queue.shift();
      const cloudPath=`${prefix}/${name}`;
      try{
        await app.uploadFile({cloudPath,fileContent:fs.createReadStream(path.join(dir,name))});
        done++;
        if(done%200===0)console.log(`  已传 ${done}/${files.length}`);
      }catch(e){
        failed++;
        if(failed<=5)console.error(`  失败 ${name}：${e.message||e}`);
      }
    }
  }
  console.log(`上传到 ${env} → ${prefix}/ （${files.length} 个文件，并发 ${concurrency}）`);
  await Promise.all(Array.from({length:concurrency},worker));
  console.log(`\n完成：成功 ${done}，失败 ${failed}`);
  console.log(`\n下一步：把下面填进 miniprogram/config/audio.js 的 AUDIO_BASE`);
  console.log(`  云开发控制台 → 存储 → 找到 ${prefix}/ 里任一文件 → 复制下载地址`);
  console.log(`  形如 https://${env}.tcb.qcloud.la/${prefix}/`);
}

main().catch(e=>die(e.message||String(e)));
