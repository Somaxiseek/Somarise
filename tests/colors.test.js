const {test}=require('node:test');const assert=require('node:assert/strict');
const {TOKENS,WEEK,LEGACY,normalize,weekColor}=require('../miniprogram/utils/tokens');
const {COLORS,CATEGORY_COLORS,pickColor,accentOf}=require('../miniprogram/utils/palette');
const rings=require('../miniprogram/utils/rings');
const {Service,seed}=require('../server/domain');
const {Habits}=require('../server/habits');
const {Learning}=require('../server/learning');
const {Goals}=require('../server/goals');

const CLOCK='2026-10-28T02:00:00Z';
function hue(hex){
  const h=hex.replace('#','');const r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  if(d<1e-6)return 0;
  let x=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4);
  return x*60;
}
function hueGap(a,b){const d=Math.abs(hue(a)-hue(b));return Math.min(d,360-d);}
function lum(hex){
  const h=hex.replace('#','');const r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255;
  return (Math.max(r,g,b)+Math.min(r,g,b))/2;
}
function sat(hex){
  const h=hex.replace('#','');const r=parseInt(h.slice(0,2),16)/255,g=parseInt(h.slice(2,4),16)/255,b=parseInt(h.slice(4,6),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;
  if(d<1e-6)return 0;
  return l>0.5?d/(2-mx-mn):d/(mx+mn);
}

// 英语紫和抗阻蓝曾经只差 19° 色相（258 / 239），并排看就是同一个颜色。
// 这条守住：两圈同时出现在页面上时必须一眼分得出来。
test('英语紫和抗阻蓝拉得开：色相差 ≥ 40°',()=>{
  assert.ok(hueGap(TOKENS.english,TOKENS.strength)>=40,
    '英语 '+TOKENS.english+' 与抗阻 '+TOKENS.strength+' 色相只差 '+hueGap(TOKENS.english,TOKENS.strength).toFixed(0)+'°');
  // 饮水青和抗阻蓝：整体走冷色调之后，青和蓝本来就挨着（35° 上下）。
  // 这两项一在日环一在周环，几乎不同屏，而且明度差 15 个点，靠明暗就能分开，所以门槛放到 32。
  assert.ok(hueGap(TOKENS.water,TOKENS.strength)>=32,
    '饮水 '+TOKENS.water+' 与抗阻 '+TOKENS.strength+' 色相只差 '+hueGap(TOKENS.water,TOKENS.strength).toFixed(0)+'°');
});

// 2026-10-28 整体压了一档：饱和度不高于 75%，明度落在 39–67 之间，白底上不刺眼也不糊。
// 饮水是唯一的例外：它是 app 里唯一为高饱和保留的强调色，刻意做得清亮（用户要求回到更清爽的青）。
test('主色饱和度 ≤ 75%（饮水例外，刻意高饱和）',()=>{
  for(const key of ['cardio','strength','body','english','move','slate']){
    const c=TOKENS[key];
    assert.ok(sat(c)<=0.76,key+' 饱和度偏高：'+Math.round(sat(c)*100)+'%');
    assert.ok(normalize(c)===c,key+' 必须是新色值');
  }
  // 饮水是 app 里唯一刻意保留的高饱和强调色，清爽感来自这里
  assert.ok(normalize(TOKENS.water)===TOKENS.water,'.water 必须是新色值');
  assert.ok(sat(TOKENS.water)>sat(TOKENS.strength),'饮水要比抗阻蓝更鲜亮');
});

test('前后端取同一套色：圆环、色板、服务端下发都是 tokens 里的值',()=>{
  assert.equal(rings.COLORS.cardio,TOKENS.cardio);
  assert.equal(rings.COLORS.strength,TOKENS.strength);
  assert.equal(rings.COLORS.water,TOKENS.water);
  assert.equal(rings.COLORS.english,TOKENS.english);
  assert.equal(rings.COLORS.learn,TOKENS.english);
  assert.equal(rings.COLORS.move,TOKENS.move);
  assert.deepEqual(COLORS.slice(0,4),[TOKENS.cardio,TOKENS.strength,TOKENS.water,TOKENS.english]);
  assert.equal(CATEGORY_COLORS['抗阻训练'],TOKENS.strength);
  assert.equal(CATEGORY_COLORS['英文学习'],TOKENS.english);

  const s=new Service(seed(),()=>{},()=>CLOCK);
  const habits=new Habits(s);const learning=new Learning(habits);
  const goals=new Goals(s,habits,learning);habits.goals=goals;
  goals.setGoal('demo-a','cardio',{target:90,applyNow:true});
  goals.setGoal('demo-a','strength',{target:3,applyNow:true});
  goals.setGoal('demo-a','water',{target:1800,applyNow:true});
  const v=goals.view('demo-a');
  assert.equal(v.day.find(i=>i.key==='water').color,TOKENS.water);
  // 周心肺直接用日环正红：淡红显灰显脏（用户点名「太浅」），心肺不走淡化
  assert.equal(v.week.find(i=>i.key==='cardio').color,TOKENS.cardio);
  assert.equal(v.week.find(i=>i.key==='strength').color,WEEK.strength);
  assert.equal(v.day.find(i=>i.key==='move').color,TOKENS.move);
});

// 周环面积大，主色压上去会太重太跳 → 同一色相，饱和度更低、明度更高（更柔）
test('周环比日环淡一档，但色相是同一个',()=>{
  for(const key of ['cardio','strength','water','body','english','move']){
    assert.ok(sat(WEEK[key])<sat(TOKENS[key]),key+' 周环要更淡：'+Math.round(sat(WEEK[key])*100)+'% vs '+Math.round(sat(TOKENS[key])*100)+'%');
    assert.ok(lum(WEEK[key])>lum(TOKENS[key]),key+' 周环要更亮一点');
    assert.ok(hueGap(WEEK[key],TOKENS[key])<=3,key+' 周环不该换色相');
  }
  // 认不出来源的自定义色：原样返回，不加淡处理
  assert.equal(weekColor('#123456'),'#123456');
  assert.equal(weekColor('#8B5CF6'),WEEK.english,'旧色先换新色再取淡版');
});

// 老账号库里存的是旧色值：读出来要挪到新色，不然只有他们还是旧配色
test('旧色值读出来会自动换成新色值',()=>{
  assert.equal(normalize('#8B5CF6'),TOKENS.english);
  assert.equal(pickColor('#6366F1'),TOKENS.strength);
  assert.equal(accentOf({color:'#22C55E'}),TOKENS.body);
  assert.equal(accentOf(null,'饮水'),TOKENS.water);
  // 土黄和粉红这两个不好看的颜色，一律改到石板灰蓝
  assert.equal(normalize('#F2B705'),TOKENS.slate);
  assert.equal(normalize('#CA9721'),TOKENS.slate);
  for(const [from,to] of Object.entries(LEGACY)){
    assert.ok(!COLORS.includes(from),'色板里不该再出现旧色 '+from);
    // 「运动」浅红不是用户可选项，不在色板里，但它必须能迁到 tokens 里那个值
    assert.ok(COLORS.includes(to)||to===TOKENS.move||Object.values(WEEK).includes(to),'新色值要能对上 tokens：'+to);
  }
});
