const {test}=require('node:test'),assert=require('node:assert/strict');const {access}=require('../server/coach-access');
test('coach role only granted by exact server allowlist; no nickname or partial match',()=>{
 assert.equal(access('wx_seek','wx_seek,wx_other').isCoach,true);
 assert.equal(access('wx_seek','').isCoach,false);
 assert.equal(access('Seek','wx_seek').isCoach,false);
 assert.equal(access('wx_se','wx_seek').isCoach,false);
 assert.equal(access('wx_seek',{role:'coach'}).isCoach,false);
});

test('Seek supplied account receives coach role, other accounts do not',()=>{assert.equal(access('wx_638a45f1b9462f73197a51766cff1b1b').role,'coach');assert.equal(access('wx_other').role,'member');});
