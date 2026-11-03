// 抓 cycle / learn 两页打开时的控制台与异常，定位空白根因
'use strict';
const automator=require('miniprogram-automator');

(async()=>{
  const mp=await automator.connect({wsEndpoint:'ws://localhost:9420'});
  mp.on('console',msg=>{
    const t=String(msg.args&&msg.args.join?msg.args.join(' '):msg.text||'');
    if(t)console.log('[console.'+msg.type+']',t.slice(0,600));
  });
  mp.on('exception',err=>console.log('[exception]',String(err&&err.message||err).slice(0,600)));

  for(const url of ['/pages/cycle/cycle','/pages/learn/learn']){
    console.log('---- open',url);
    const page=await mp.reLaunch(url);
    await new Promise(r=>setTimeout(r,2500));
    const data=await page.data();
    console.log('loaded=',data.loaded,'keys=',Object.keys(data).slice(0,20).join(','));
    console.log('has-error-dialog=',!!(await page.$('.modal')||await page.$('.dialog')));
  }
  await mp.disconnect();
})().catch(e=>{console.error('脚本失败:',e.message);process.exit(1);});
