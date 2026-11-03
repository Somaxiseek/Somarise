'use strict';
const {fail}=require('./domain');
// Deliberately not wired into local HTTP routes. Requires separate approved test app.
async function exchangeCode(code,{appId,secret,fetchImpl=fetch}={}){
 if(!appId||!secret)fail('未配置微信测试身份服务',503);
 if(typeof code!=='string'||code.length<4||code.length>256)fail('无效登录凭证');
 const url=new URL('https://api.weixin.qq.com/sns/jscode2session');for(const [k,v] of Object.entries({appid:appId,secret,js_code:code,grant_type:'authorization_code'}))url.searchParams.set(k,v);
 const response=await fetchImpl(url,{signal:AbortSignal.timeout(5000)});if(!response.ok)fail('微信身份服务暂不可用',502);const data=await response.json();if(data.errcode||typeof data.openid!=='string')fail('微信登录凭证无效',401);
 // Persist mapping (appId, openid) -> internal UUID on trusted server; never return session_key.
 return {provider:'wechat',appId,subject:data.openid,unionId:data.unionid||null};
}
module.exports={exchangeCode};
