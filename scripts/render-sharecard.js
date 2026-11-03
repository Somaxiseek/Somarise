// 把分享卡按真 canvas 画一遍导出 PNG，用于肉眼验收版式（不上线，只在本地跑）
// 卡片是带透明圆角的 PNG，所以垫一层浅灰底再看，才看得见四个角是不是圆的。
const fs=require('fs');
const path=require('path');
const {createCanvas}=require('@napi-rs/canvas');
const {paintShareCard,W,H,RADIUS}=require('../miniprogram/utils/sharecard-paint');
const {shareCard,todayReport}=require('../miniprogram/utils/report');

const today=process.env.DAY||new Date(Date.now()+8*3600*1000).toISOString().slice(0,10);
const mk=(o)=>Object.assign({key:'water',label:'饮水',period:'daily',periodLabel:'今日',metric:'ml',unit:'ml',
  color:'#06B6D4',current:600,target:2100,recordOnly:false,closed:false,percent:29,
  valueText:'600/2100 ml',remainText:'还差 1500 ml'},o);

const home={goals:{today,
  day:[mk({}), mk({key:'learn',label:'英语',color:'#A659C5',current:2,target:5,percent:40,valueText:'2/5 词',remainText:'还差 3 个'}),
       mk({key:'move',label:'运动',color:'#DF7A77',recordOnly:true,target:0,current:35,percent:0,valueText:'35 分钟',remainText:'仅记录'})],
  week:[mk({key:'cardio',label:'心肺',period:'weekly',periodLabel:'本周',color:'#D93B36',current:70,target:150,percent:47,valueText:'70/150 分钟',remainText:'还差 80 分钟'})],
  recordedToday:2}};

const r=todayReport(home);
const card=shareCard(r,'找到适合自己的表达方式。');
const dpr=3;

// ① 真 canvas：透明底，跟小程序里那张一样
const canvas=createCanvas(W*dpr,H*dpr);
const ctx=canvas.getContext('2d');
ctx.scale(dpr,dpr);
paintShareCard(ctx,W,H,card);

// ② 垫底：四周留 18px 浅灰，四角透明没裁好会立刻看出来
const PAD=18,BG='#e6e8e7';
const page=createCanvas((W+PAD*2)*dpr,(H+PAD*2)*dpr);
const pctx=page.getContext('2d');
pctx.fillStyle=BG;
pctx.fillRect(0,0,page.width,page.height);
pctx.drawImage(canvas,PAD*dpr,PAD*dpr);

const out=path.join(__dirname,'..','outputs','shots','sharecard-preview.png');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,page.toBuffer('image/png'));
console.log('写出',out, canvas.width+'x'+canvas.height,'圆角',RADIUS,'四边留白',JSON.stringify({left:32,right:32,top:28,bottom:26}));
console.log('dateEn:',card.dateEn,'| rings:',JSON.stringify(card.rings));
