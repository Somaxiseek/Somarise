'use strict';
// Only deployment configuration grants coach access; nickname/profile input never does.
const DEFAULT_COACH_IDS='wx_638a45f1b9462f73197a51766cff1b1b';
function access(uid,config=process.env.Somarise_COACH_USER_IDS===undefined?DEFAULT_COACH_IDS:process.env.Somarise_COACH_USER_IDS){
 const ids=String(config).split(',').map(s=>s.trim()).filter(Boolean);
 return {userId:uid,role:ids.includes(uid)?'coach':'member',isCoach:ids.includes(uid)};
}
module.exports={access};
