const runtime=require('./config/runtime');
const LOOPBACK='http://127.0.0.1:8787';
const isLoopback=url=>/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url||'');

function platformName(){
  try{return wx.getDeviceInfo?wx.getDeviceInfo().platform:wx.getSystemInfoSync().platform;}
  catch(e){return '';}
}

// 页面栈只剩一层、又不是首页时，微信会往左上角塞一颗灰色的「返回首页」房子按钮。
// 我们每页底部都有 dock（点「打卡」就回去了），那颗按钮纯属多余 —— 统一关掉。
// 包一层 Page，新增页面自动带上，不用每页记着调。
function hideHome(){
  try{ wx.hideHomeButton({fail(){}}); }catch(e){}
}
const rawPage = typeof Page === 'function' ? Page : null;
if (rawPage) {
  Page = function(opts){
    const show = opts && opts.onShow;
    opts.onShow = function(){
      hideHome();
      return show ? show.apply(this, arguments) : undefined;
    };
    return rawPage(opts);
  };
}

App({
  globalData:{
    mode:'local-demo',
    demoUserId:'demo-a',
    token:'',
    dirty:true,
    home:null,
    base:LOOPBACK,
    cloudFunction:runtime.cloudFunction
  },
  onLaunch(){
    const g=this.globalData;
    const platform=platformName();
    const onDevice=!!platform&&platform!=='devtools';

    // 1) 云开发：手机不依赖电脑，体验版的正式路径
    if(runtime.cloudEnv){
      g.mode='wechat-cloud';
      if(!wx.cloud){
        g.startupError='微信版本不支持云能力，请更新微信';
        return;
      }
      wx.cloud.init({env:runtime.cloudEnv,traceUser:false});
      return;
    }

    // 2) 真机：直连本机局域网演示服务（需同一 Wi-Fi + 打开调试模式）
    if(onDevice){
      if(runtime.apiBase&&/^https?:\/\//.test(runtime.apiBase)){
        g.mode='local-lan';
        g.base=runtime.apiBase.replace(/\/+$/,'');
      }else{
        g.mode='unconfigured-mobile';
        g.startupError='手机体验环境尚未配置：在 miniprogram/config/runtime.js 填写 cloudEnv（云开发），或在本机执行 npm run lan 写入局域网地址。';
      }
      return;
    }

    // 3) 开发者工具模拟器：默认本机回环地址
    if(runtime.apiBase&&isLoopback(runtime.apiBase))g.base=runtime.apiBase.replace(/\/+$/,'');
    g.mode='local-demo';
  }
});
