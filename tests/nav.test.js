const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

// 微信会在「页面栈只剩一层、又不是首页」时往左上角塞一颗「返回首页」房子按钮。
// 我们每页底部都有 dock，那颗按钮是多余的 —— app.js 统一包一层 Page 把它关掉。
// 这条测试守着：包装还在、onShow 真的会被调用、页面自己的 onShow 没被吃掉。
function sandbox(){
  let definition=null;
  const calls={hide:0, appShow:0};
  const ctx={
    App:()=>{}, Page:p=>{definition=p;},
    wx:{hideHomeButton:o=>{calls.hide++;if(o&&o.fail)o.fail({});},getDeviceInfo:()=>({platform:'devtools'})},
    require:id=>String(id).includes('config/runtime')?{}:{},
    console,Date,Math,Number,String,Array,Object,JSON,Promise,Error,setTimeout,clearTimeout
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../miniprogram/app.js'),'utf8'),ctx);
  return {ctx,calls,get definition(){return definition;}};
}

test('进入页面时隐藏微信原生「返回首页」按钮',()=>{
  const s=sandbox();
  let shown=0;
  s.ctx.Page({data:{},onShow(){shown++;}});
  assert.ok(s.definition,'页面必须能注册');
  s.definition.onShow.call({});
  assert.equal(s.calls.hide,1,'onShow 里要调 wx.hideHomeButton');
  assert.equal(shown,1,'页面自己的 onShow 不能被吃掉');
});

test('没有写 onShow 的页面也会被补上，多次进入都会重新隐藏',()=>{
  const s=sandbox();
  s.ctx.Page({data:{}});
  assert.equal(typeof s.definition.onShow,'function','没写 onShow 也要补一个');
  s.definition.onShow.call({});
  s.definition.onShow.call({});
  assert.equal(s.calls.hide,2,'每次回到页面都要重新调，返回后再进不能又冒出来');
});

test('在 node 里跑（没有 Page 全局）不能让 app.js 崩掉',()=>{
  const ctx={
    App:()=>{},
    wx:{hideHomeButton(){},getDeviceInfo:()=>({platform:'devtools'})},
    require:id=>String(id).includes('config/runtime')?{}:{},
    console,Date,Math,Number,String,Array,Object,JSON,Promise,Error,setTimeout,clearTimeout
  };
  vm.createContext(ctx);
  assert.doesNotThrow(()=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../miniprogram/app.js'),'utf8'),ctx));
});
