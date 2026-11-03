'use strict';
const cloud=require('wx-server-sdk');const {createGateway}=require('./server/mobile-gateway');const {parseOcrItems}=require('./server/ocr-parse');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
// 集合名属于「数据库标识」，跟品牌改名无关：必须保持 somactive_trial_data。
// 2026-10-30 改名时被误改成 Somarise_trial_data，重新部署后代码读了一个空集合，
// 看起来像「账号被重置成新成员、记录全没」——实际旧数据一直躺在原集合里。
const db=cloud.database();const COLLECTION='somactive_trial_data';
const repository={transaction:run=>db.runTransaction(async transaction=>run({
 async get(key){try{const result=await transaction.collection(COLLECTION).doc(key).get();return result.data?.payload||null;}catch(e){if(/document.*(?:not exist|does not exist)|文档.*不存在/i.test(e.message||e.errMsg||''))return null;throw e;}},
 async set(key,payload){await transaction.collection(COLLECTION).doc(key).set({data:{payload,updatedAt:new Date().toISOString()}});}
}))};

// 截图识别：客户端把图传到云存储，只给一个 fileID，这里临时取 URL 交给微信官方 OCR（云调用），
// 识别完立刻删文件——会员的运动截图不该长期躺在云存储里。
// 云调用不需要 access_token，但需要云函数 config.json 里声明 ocr.printedText 权限，且小程序已认证。
function ocrError(e){
  const code=Number(e&&(e.errCode||e.errcode))||0;
  const msg=String((e&&(e.errMsg||e.errmsg||e.message))||'');
  try{console.warn('[ocr]',code,msg);}catch(x){}
  // 101003 = 服务市场的 OCR 免费资源包没领（100 次/天，0 元，但要手动领一次）。
  // 会员看不懂这个，所以提示说人话，细节留在云开发日志里给运维看。
  if(code===48001||/api unauthorized|权限/i.test(msg))return Object.assign(new Error('图片识别暂时用不了，先手动填一下'),{status:422});
  if(code===101003||/quota|额度/i.test(msg))return Object.assign(new Error('图片识别暂时用不了，先手动填一下'),{status:429});
  if(code===101002||/image/i.test(msg))return Object.assign(new Error('图片太大或格式不支持，换一张截图'),{status:422});
  if(code===-504003||/timed? ?out|超时/i.test(msg))return Object.assign(new Error('识别超时了，换个网络再试或手动填'),{status:504});
  return Object.assign(new Error('识别没成功，可以手动填'),{status:502});
}
async function ocrFile(fileID){
  let url='';
  try{
    const r=await cloud.getTempFileURL({fileList:[fileID]});
    url=((r.fileList||[])[0]||{}).tempFileURL||'';
  }catch(e){url='';}
  if(!url)throw Object.assign(new Error('图片没传上去，请重新上传'),{status:422});
  try{
    const res=await cloud.openapi.ocr.printedText({imgUrl:url});
    const items=(res&&res.items)||[];
    const parsed=parseOcrItems(items,{timeZone:'Asia/Shanghai'});
    return {draft:parsed.draft,message:parsed.warnings[0]};
  }catch(e){
    if(e&&e.status)throw e;
    throw ocrError(e);
  }finally{
    try{await cloud.deleteFile({fileList:[fileID]});}catch(e){}
  }
}

const gateway=createGateway(repository,{ocrFile});
// 集合必须先在云环境里存在，doc().set() 才不会报 -502005（集合不存在）。
// 第一次被调用时顺手建一次，省掉「去控制台手动新建集合」这一步；建不动就算了，真报错会原样抛给客户端。
let ready=null;
function ensureCollection(){
  if(ready)return ready;
  ready=(async()=>{
    try{await db.collection(COLLECTION).count();return;}
    catch(e){
      const msg=(e&&(e.message||e.errMsg))||'';
      if(!/-502005|not exist|does not exist|不存在/i.test(msg))return;
      if(typeof db.createCollection!=='function')return;
      // 不同版本的 SDK 一个收字符串、一个收对象，两种都试一次
      try{await db.createCollection(COLLECTION);}catch(e1){try{await db.createCollection({collectionName:COLLECTION});}catch(e2){}}
    }
  })().catch(()=>{});
  return ready;
}
// 定时触发器（config.json 里的 keepWarm，每 5 分钟一跳）只为「保温」：容器和数据库连接
// 不被回收，会员真正打开时就不用再等冷启动那 2–3 秒。它不做任何业务，也不返回数据。
function isWarmup(event){
  if(!event)return false;
  const type=String(event.Type||event.type||'');
  return type.toLowerCase()==='timer'||!!event.triggerName;
}

exports.main=async event=>{
  if(isWarmup(event)){
    try{await db.collection(COLLECTION).count();}catch(e){}
    return {ok:true,warm:true};
  }
  // 集合早已存在（有数据），没必要让每个请求先等一趟 count 才开工——那正好压在冷启动最贵的位置上。
  // 改成后台补一次：真遇到新环境没有集合，这一跳也会把它建出来，只是不再挡首屏。
  ensureCollection();
  return gateway(event,cloud.getWXContext());
};
