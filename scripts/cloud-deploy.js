'use strict';
// 一条命令把云函数推到云开发：先重建包（保证和源码一致），再部署。
//   npm run cloud:deploy
// 环境 ID 从 miniprogram/config/runtime.js 的 cloudEnv 读；没有就先 npm run cloud:env <id>。
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const devtools=require('./devtools');

const root=path.join(__dirname,'..');
const runtime=require(path.join(root,'miniprogram','config','runtime.js'));
const env=(runtime.cloudEnv||'').trim();

if(!env){
  console.error('还没配云环境：先 node scripts/cloud-env.js <环境ID>');
  process.exit(1);
}

console.log('① 重建云函数包');
execFileSync(process.execPath,[path.join(__dirname,'build-cloud.js')],{stdio:'inherit'});

console.log('② 部署到云环境 '+env);

// 新开的环境里函数会先处于 Creating 状态，这时推代码会报
// FailedOperation.UpdateFunctionCode；等一会儿重试就好，不用人去看。
function deployOnce(){
  try{
    return {out:devtools.run([
      'cloud','functions','deploy',
      '--env',env,
      '--names','somactiveApi',
      '--remote-npm-install',
      '--project',root
    ],{timeout:600000}),ok:true};
  }catch(e){
    return {out:String((e.stdout||'')+(e.stderr||'')+e.message),ok:false};
  }
}

const MAX=6;
let last='';
for(let i=1;i<=MAX;i++){
  const r=deployOnce();
  last=r.out;
  const ok=/│\s*somactiveApi\s*│\s*true\s*│/.test(r.out);
  if(ok){process.stdout.write(r.out);break;}
  const creating=/Creating|正在创建|状态/.test(r.out);
  if(i===MAX||(!creating&&/Missing|not found|无权限/.test(r.out))){
    process.stdout.write(r.out);
    console.error('\n✖ 部署失败（第 '+i+' 次）。'+(creating?'函数长时间处于 Creating 状态，去云开发控制台看一眼。':''));
    process.exit(1);
  }
  const wait=i*10;
  console.log('   函数还在创建中，'+wait+'s 后重试（'+i+'/'+MAX+'）…');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,wait*1000);
}

console.log('\n✔ 云函数已部署。集合固定为 somactive_trial_data（数据库标识，不随品牌改名）。');
