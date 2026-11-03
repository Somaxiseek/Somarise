'use strict';
const {validate,fail}=require('./domain');
// Only an authorized server adapter may call this boundary. No platform OAuth is enabled.
function normalizeImport(provider,externalActivity,consent,now){if(consent?.provider!==provider||consent?.scope!=='activities:read'||consent?.revoked)fail('外部平台尚未授权',403);const x=externalActivity;const multiplier={m:1,km:1000,mi:1609.344}[x.unit];if(!multiplier||!x.id)fail('外部活动单位或ID无效');return {...validate({...x,distanceM:Math.round(x.distance*multiplier/(x.type==='swimming'?1:10))*(x.type==='swimming'?1:10)},now),externalId:String(x.id),source:'import_mock'};}
module.exports={normalizeImport};
