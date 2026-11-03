'use strict';
// 上传一个「开发版本」，之后去小程序后台把它设为体验版。
//   npm run upload -- 0.1.0 "首个体验版"
// 版本号必填；备注不填就写默认。上传前会跑一遍 preflight，有硬问题直接停。
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const devtools=require('./devtools');

const root=path.join(__dirname,'..');
const version=(process.argv[2]||'').trim();
const desc=(process.argv[3]||'').trim()||'Somarise 体验版';

if(!/^\d+\.\d+\.\d+$/.test(version)){
  console.error('版本号要写成 x.y.z，例如：npm run upload -- 0.1.0 "首个体验版"');
  process.exit(1);
}

const runtime=require(path.join(root,'miniprogram','config','runtime.js'));
if(!(runtime.cloudEnv||'').trim()){
  console.error('⚠️  cloudEnv 是空的：这样传上去的体验版在手机上会提示「尚未配置」，因为手机连不到你电脑的 8787。');
  console.error('    先 node scripts/cloud-env.js <环境ID>，再上传。');
  process.exit(1);
}

console.log('① 自检');
try{execFileSync(process.execPath,[path.join(__dirname,'preflight.js')],{stdio:'inherit'});}
catch(e){console.error('自检没通过，先修上面的 ✗ 再传');process.exit(1);}

console.log('② 上传 '+version);

// 上传偶尔会 ECONNRESET（IDE 与后台的连接被掐断），重试通常就好了；
// 但原来的写法不管成败都打印「已上传」，会让人以为传上去了——这里必须认成败。
const MAX=3;
let out='';
for(let i=1;i<=MAX;i++){
  try{
    out=devtools.run(['upload','--project',root,'-v',version,'-d',desc],{timeout:600000})||'';
    // 成功的标志：打出体积汇总表（含 TOTAL 行），失败会带 [error]
    const okTable=/│\s*TOTAL\s*│/.test(out);
    if((okTable||/上传成功/.test(out))&&!/\[error\]/.test(out))break;
    throw new Error(out.split('\n').find(l=>/\[error\]|message:/.test(l))||'上传没有返回成功信息');
  }catch(e){
    const msg=String(e.message||'');
    out=String((e.stdout||'')+(e.stderr||''))||out;
    if(i===MAX){
      process.stdout.write(out+'\n');
      console.error('✖ 上传失败（第 '+i+' 次）：'+msg.split('\n')[0]);
      console.error('  常见原因：开发者工具掉登录 / 网络中断 / 后台正在提审。重开工具登录后重跑本命令即可。');
      process.exit(1);
    }
    console.log('   第 '+i+' 次上传失败（'+msg.split('\n')[0].slice(0,60)+'），8s 后重试…');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,8000);
  }
}
process.stdout.write(out||'');
console.log('\n✔ 已上传。打开 mp.weixin.qq.com → 管理 → 版本管理 → 开发版本 →「选为体验版」，');
console.log('  再把体验成员（你自己 + 朋友）的微信号加进「成员管理」，他们扫体验版二维码就能用。');
