let renewing=null;
function send(path,method,data){const app=getApp();if(app.globalData.startupError)return Promise.reject(new Error(app.globalData.startupError));if(app.globalData.mode==='wechat-cloud')return cloudSend(path,method,data);return new Promise((resolve,reject)=>wx.request({url:app.globalData.base+path,method,data,header:{Authorization:'Bearer '+app.globalData.token},success:r=>{if(r.statusCode>=400){const e=new Error(r.data?.error||'请求失败');e.status=r.statusCode;reject(e);}else resolve(r.data);},fail:()=>reject(new Error(app.globalData.mode==='local-lan'?'连不上电脑上的服务：请确认手机与电脑在同一 Wi-Fi，且电脑已运行 npm run lan':'连接失败，请启动本地服务后重试'))}));}
function cloudSend(path,method,body){const app=getApp();return new Promise((resolve,reject)=>wx.cloud.callFunction({name:app.globalData.cloudFunction||'somactiveApi',data:{path,method,body:body||{}},success:r=>{const result=r.result;if(!result||typeof result.status!=='number'){reject(new Error('云函数返回格式异常'));return;}if(result.status>=400){const e=new Error(result.data?.error||'云端请求失败');e.status=result.status;reject(e);}else resolve(result.data);},fail:e=>{const code=Number(e&&e.errCode);let msg='连不上服务，检查下网络再试一次';if(code===-504002||code===-504003)msg='云端处理超时了，再试一次或手动填写';else if(code===-501000||code===-501001)msg='云环境还没就绪，稍等一下再试';try{console.warn('[cloud] callFunction fail',code,e&&e.errMsg);}catch(x){}reject(new Error(msg));}}));}
async function login(id='demo-a'){const app=getApp();
 // 云函数每趟都从 OPENID 派生 uid 自鉴权（server/mobile-gateway.js 的 identity），
 // 前端 token 只是占位、不参与鉴权；/identity 返回的 user 全代码库无读取方
 // （各页都用自己的接口返回的 h.user）。所以云模式下直接同步置位，省掉首屏那趟
 // 云函数调用 —— 首屏从「login + home」两趟串行降到只等 home 一趟，冷启动不再翻倍。
 // 云模式下 token 是常量占位、不参与鉴权，这里同步置位即可，省掉首屏那趟 /identity 云调用。
 // 注意：不再在这里把 dirty 置 true —— 那样会让每次 onShow 都强制重拉首页，
 // 首页「缓存秒开」被冲掉、还平白多一趟云函数往返（这正是进首页闪一下/跳动的根因）。
 // dirty 只在数据变更（change）或首屏（初值 true）时为真，首页据此决定是否刷新。
 if(app.globalData.mode==='wechat-cloud'){app.globalData.token='wechat-cloud';return {mode:'wechat-cloud'};}
 const r=await send('/local-session','POST',{userId:id});app.globalData.token=r.token;app.globalData.demoUserId=id;app.globalData.dirty=true;return r;}
async function api(path,method='GET',data){try{return await send(path,method,data);}catch(e){const app=getApp();const local=(app.globalData.mode==='local-demo'||app.globalData.mode==='local-lan')&&/^http:\/\//.test(app.globalData.base||'');if(e.status!==401||!local||path==='/local-session')throw e;
 // A restarted local service invalidates its memory-only sessions. 401 is issued
 // before any write, so retry only this explicit rejection, never a network error.
 if(!renewing)renewing=login(app.globalData.demoUserId||'demo-a').finally(()=>{renewing=null;});await renewing;return send(path,method,data);
}}
function error(e){wx.showModal({title:'提示',content:e.message||'操作失败，请重试',showCancel:false});}
function change(){getApp().globalData.dirty=true;}
module.exports={api,login,error,change};
