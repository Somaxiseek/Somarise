const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {lockDir,resist,fires,progress}=require('../miniprogram/utils/swipe');
const {tint,shade}=require('../miniprogram/utils/tokens');

const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

// ── 方向锁 ──
test('竖着滑列表时不该把行拖走',()=>{
  assert.equal(lockDir(20,18),'','横竖差不多，当竖滑处理');
  assert.equal(lockDir(-14,20),'','竖着滑：不接管手势');
  assert.equal(lockDir(5,40),'');
});
test('起手那几像素是手抖，先不判方向',()=>{
  assert.equal(lockDir(6,0),'','不到 8px 不认');
  assert.equal(lockDir(-7,1),'');
  assert.equal(lockDir(9,1),'right');
});
test('横向够了就分左右：左滑露右边按钮，右滑露左边按钮',()=>{
  assert.equal(lockDir(-40,6),'left');
  assert.equal(lockDir(40,-6),'right');
});

// ── 阻尼与触发 ──
test('按钮宽度之内跟手，超出去加阻尼且不会滑飞',()=>{
  assert.equal(resist(60,92),60);
  assert.equal(resist(-60,92),-60);
  const far=Math.abs(resist(400,92));
  assert.ok(far>92,'超过按钮宽还能再走一点，有橡皮筋的感觉');
  assert.ok(far<=92*1.35,'但不能一路滑出去，最多到这里');
  assert.equal(resist(-400,92)<0,true,'方向不能被阻尼改掉');
});
test('滑不到阈值就当没发生，滑到了才执行',()=>{
  assert.equal(fires(56,57),false);
  assert.equal(fires(57,57),true);
  assert.equal(fires(-60,57),true);
  assert.equal(fires(0,57),false);
});
test('按钮文字从淡到实，最多到 1',()=>{
  assert.ok(progress(28,57)>0.47&&progress(28,57)<0.51);
  assert.equal(progress(200,57),1);
  assert.equal(progress(-57,57),1);
});

// ── 按钮配色跟着这一笔走 ──
test('淡底深字：同色系的两个变体，认不出的颜色退回中性灰',()=>{
  assert.equal(tint('#000000',0.5),'#808080','主色掺白一半');
  assert.equal(tint('#000000'),'#dbdbdb','默认只留一点点色：掺 86% 白，不是一整块深色');
  assert.equal(tint('#D93B36').length,7);
  assert.notEqual(tint('#D93B36'),'#D93B36');
  assert.equal(shade('#D93B36',0).toLowerCase(),'#d93b36','掺 0 就是原色');
  assert.equal(tint('rgb(1,2,3)'),'#F2F1EF','怪色值别把按钮变成白字白底');
  assert.equal(shade(''),'#F2F1EF');
});

