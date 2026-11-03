// 用小程序自动化接口把每个页面真实渲染出来截图，存到 outputs/shots/。
// 用途：看视觉，不看代码猜。需要先开 IDE 服务端口并起自动化端口。
'use strict';
const path=require('path');
const fs=require('fs');
const automator=require('miniprogram-automator');

const OUT=path.join(__dirname,'..','outputs','shots');
const PORT=process.env.AUTO_PORT||'9420';

// 每个目标：页面路径 + 截图前可执行的动作（点开弹层、滚动等）；scroll 是额外滚动位置
const targets=[
  {name:'01-home',url:'/pages/home/home',scroll:[0,420,840]},
  {name:'02-home-week',url:'/pages/home/home',before:async p=>{const tabs=await p.$$('.ring-tab');if(tabs&&tabs[1])await tabs[1].tap();}},
  // 注意：不要再点「分享到群」。它会拉起系统图片菜单（发送给朋友 / 保存图片…），
  // 那个浮层是原生层，自动化关不掉，会一直盖在后续所有截图上。
  // 想看分享卡就调 openShare（面板 + canvas），见下面的 02b。
  {name:'03-home-rings-popup',url:'/pages/home/home',before:async p=>{const el=await p.$('.ring-body');if(el)await el.tap();}},
  // 分享卡：只调 openShare（在预览面板里那张真 canvas 上画），不点「分享到群」——
  // 那会拉起系统图片菜单，原生浮层自动化关不掉，会盖住后面所有截图。
  {name:'02b-home-share',url:'/pages/home/home',before:async(p,mp)=>{await callPage(mp,'openShare');},wait:1500},
  {name:'03b-home-cardio-expanded',url:'/pages/home/home',before:async p=>{const els=await p.$$('.sport-card');for(const el of els){const t=await el.text&&await el.text();if(t&&t.indexOf('心肺训练')>=0){await el.tap();break;}}}},
  {name:'04-learn',url:'/pages/learn/learn',scroll:[0,400],before:ensureWord},
  // 词根浮窗：点词里带虚线的那一段，看上下文行和「常见词」胶囊
  // 只有当天的词能拆出带释义的词根时才有 .word-seg-on；拆不出就只拍到普通学习页（不是报错）
  {name:'04b-learn-part',url:'/pages/learn/learn',before:async(p,mp)=>{await ensureWord(p,mp);const el=await p.$('.word-seg-on');if(el)await el.tap();},wait:1200},
  {name:'05-learn-revealed',url:'/pages/learn/learn',before:async(p,mp)=>{await ensureWord(p,mp);await p.setData({revealed:true});}},
  // 学习范围：标题下的「范围 · 全部」胶囊 + 点开后的分类勾选浮层（老人可只学日常）
  {name:'04c-learn-scope',url:'/pages/learn/learn',before:ensureWord},
  {name:'04d-learn-cats',url:'/pages/learn/learn',wait:600,before:async(p,mp)=>{await ensureWord(p,mp);await callPage(mp,'toggleCatPanel');}},
  {name:'06-achievements',url:'/pages/achievements/achievements',scroll:[0,420,840,1260]},
  {name:'07-goals',url:'/pages/goals/goals',scroll:[0,420,840]},
  {name:'08-record',url:'/pages/record/record',scroll:[0,420]},
  // 抗阻打卡（2026-10-30 加「这次练到什么程度」）与新建分组（「算作运动」开关）
  {name:'08b-record-strength',url:'/pages/record/record?mode=strength',scroll:[0,420]},
  {name:'08c-create-cat',url:'/pages/create/create?only=1'},
  {name:'09-onboard',url:'/pages/onboard/onboard'},
  // 引导最后一步才是「想记哪些」那屏（goal-set 组件），翻三张才到；不拍就只能看到第 1 张
  {name:'09b-onboard-goals',url:'/pages/onboard/onboard',before:async(p,mp)=>{
    await callPage(mp,'goTo',3);
  },wait:1500,scroll:[0,600]},
  // 「我的」：账号身份 → 个人设置 → 目标设置 → 教练授权 → 教练码（只有教练账号有这段，往下滚才看得到）
  {name:'10-account',url:'/pages/account/account',scroll:[560,900]},
  // 挑头像：24 款成品头像的 4×6 网格，看选中描边和「先不选」那行
  {name:'10b-avatar',url:'/pages/avatar/avatar'},
  // 圆环编辑器是首页内浮层：进首页后调用 ringManage 打开，等接口和进场动画
  {name:'11-rings-manage',url:'/pages/home/home',before:async(p,mp)=>{
    await callPage(mp,'ringManage');
  },wait:1500},
  {name:'12-vocab',url:'/pages/vocab/vocab',scroll:[0,420]},
  // 周期看板：头像卡 → 本周目标 → 回顾（热力图年视图 + 强度饼）。
  // 2026-10-30 删掉了四张闭环周数卡，页面短了，滚动位跟着往前收。
  {name:'20-cycle',url:'/pages/cycle/cycle',scroll:[0,700,1300]},
  // 热力图的周 / 月视图：这两个视图是「庆祝」最该出现的地方，单独拍
  {name:'20b-cycle-week',url:'/pages/cycle/cycle',wait:1200,before:async(p,mp)=>{await callPage(mp,'setHeatView',{currentTarget:{dataset:{v:'week'}}});},scroll:[520]},
  {name:'20c-cycle-month',url:'/pages/cycle/cycle',wait:1200,before:async(p,mp)=>{await callPage(mp,'setHeatView',{currentTarget:{dataset:{v:'month'}}});},scroll:[520]},
  // 例句里的词：展开释义后滚到例句那一段，看紫色下划线标得吵不吵
  {name:'05b-learn-links',url:'/pages/learn/learn',scroll:[0,520],before:async(p,mp)=>{await ensureWord(p,mp);await p.setData({revealed:true});}},
  // 单词页：从例句点进来的落脚点（squat 的例句里能点到 deadlift / hip hinge）
  {name:'05c-word',url:'/pages/word/word?id=squat',wait:1500,scroll:[0,420]},
  {name:'14-body',url:'/pages/body/body'},
  {name:'16-body',url:'/pages/body/body'},
  // 项目详情必须带 id，否则只会拍到「项目不存在」的空壳
  {name:'16-project',url:'/pages/project/project',needProject:true},
  {name:'17-create',url:'/pages/create/create?preset=cardio'},
  // 会员授权页：关联只能由会员本人建立，这一页要能一眼看清「教练会看到什么」
  {name:'18-authorize',url:'/pages/authorize/authorize',wait:1500},
  // 教练端只剩会员看板（自己的看板在 pages/cycle）：教练码就摆在这儿（devtools 账号即配置里的教练 uid）
  // 往下滚：有氧/抗阻/饮水是百分比轴，体重/腰围是 ±变化量轴，两种纵轴都得看一眼
  {name:'19-coach-members',url:'/pages/coach/coach',wait:1800,scroll:[520,1080,1700]},
  {name:'17b-create-filled',url:'/pages/create/create?preset=cardio',before:async(p,mp)=>{
    await mp.evaluate(()=>{const ps=getCurrentPages(),pg=ps[ps.length-1];pg.input({currentTarget:{dataset:{key:'name'}},detail:{value:'晨跑'}});});
  }},
  // 新建项目页：六种周期胶囊 + 按次/按分钟单位（更多设置展开）
  {name:'17c-create-periods',url:'/pages/create/create',before:async(p,mp)=>{
    await callPage(mp,'toggleMore');
  },wait:600,scroll:[500]},
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// automator 的 page.callMethod 在这个 IDE 版本里找不到页面方法（this.xxx is not a function），
// 改成在 AppService 里从页面栈取当前页再调，稳得多。
function callPage(mp,method,...args){
  return mp.evaluate(function(m,a){
    const ps=getCurrentPages(), pg=ps[ps.length-1];
    if(!pg||typeof pg[m]!=='function')return false;
    pg[m].apply(pg,a||[]);
    return true;
  },method,args);
}

// 演示账号可能已经把今天的词学完了，那样截图只会拍到完成态：
// 没有词条卡时先多要几个新词，保证拍到的是「学习中」那一屏
async function ensureWord(p,mp){
  if(await p.$('.word-card'))return;
  try{await callPage(mp,'more');}catch(e){}
  await sleep(2000);
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const mp=await automator.connect({wsEndpoint:'ws://localhost:'+PORT});
  const info=await mp.systemInfo();
  console.log('device:',info.platform,info.windowWidth+'x'+info.windowHeight,'dpr',info.pixelRatio);

  // 只重拍某几页：node scripts/shots.js 07 12（按名字子串匹配），全部重拍就不带参数
  const only=process.argv.slice(2);
  const picked=only.length?targets.filter(t=>only.some(k=>t.name.includes(k))):targets;
  if(!picked.length){console.log('没有匹配的截图目标：'+only.join(' '));process.exit(1);}
  for(const t of picked){
    try{
      let url=t.url;
      if(t.needProject){
        const id=await mp.evaluate(()=>{
          const home=getApp().globalData.home||{};
          const list=(home.habits||{}).projects||[];
          const water=list.find(p=>p.kind==='hydration');
          return (water||list[0]||{}).id||'';
        });
        if(!id)throw new Error('没有可用的项目 id');
        url=url+'?id='+id;
      }
      const page=await mp.reLaunch(url);
      await sleep(1200);
      // 小程序没重启，globalData.home 有可能是旧缓存 → 强制重新拉一次
      try{await callPage(mp,'load',true);}catch(e){}
      await sleep(600);
      if(t.before)await t.before(page,mp);
      await sleep(t.wait||900);
      await mp.pageScrollTo(0);
      await sleep(300);
      await mp.screenshot({path:path.join(OUT,t.name+'.png')});
      const scrolls=t.scroll||[];
      for(const y of scrolls){
        if(!y)continue;
        await mp.pageScrollTo(y);
        await sleep(500);
        await mp.screenshot({path:path.join(OUT,t.name+'@'+y+'.png')});
      }
      console.log('ok  ',t.name,scrolls.length?'+'+scrolls.length+' scrolls':'');
    }catch(e){
      console.log('FAIL',t.name,'-',e&&e.message);
    }
  }
  await mp.disconnect();
})().catch(e=>{console.error('fatal',e);process.exit(1);});
