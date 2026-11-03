const {api,login,error,change}=require('../../utils/api');
const tip=require('../../utils/tip');

// 我的 = 只放「关于我」的东西：昵称、目标设置、重看引导。
// 时区不再让用户选（统计按手机本地时区）；词库入口搬去学习页，每天新词搬去目标设置。
Page({
  data:Object.assign({
    accountAccess:null, loaded:false, tip:'', code:'', consent:false, demo:false, resetting:false,
    coachLine:'', isCoach:false, invite:''
  },tip.data),
  toggleTip(e){tip.toggle.call(this,e);},

  // 冷启动秒开：上次的昵称/口令先摆出来，onShow 照常联网刷新
  onLoad(){
    try{
      const cache=wx.getStorageSync&&wx.getStorageSync('Somarise.accountCache');
      if(cache&&cache.user)this.setData({loaded:true,user:cache.user,link:cache.link});
    }catch(e){}
  },

  async onShow(){
    const mode=getApp().globalData.mode;
    this.setData({demo:mode==='local-demo'||mode==='local-lan'});
    try{
      if(!getApp().globalData.token)await login();
      await this.load();
    }catch(e){error(e);}
  },

  // 三趟请求并行发（2026-10-30 性能排查：原来串行 await，真机上 4 趟云函数
  // 一趟接一趟 ≈ 2.5s，页面半天不出内容；并行后只要一趟往返）。
  // /home 是「资料」的真源头：顺手把缓存里的自己刷新掉，免得看板还拿着旧昵称。
  async load(){
    const app=getApp();
    const [h,access,link]=await Promise.all([
      api('/home'),
      api('/account-access').catch(()=>null),
      api('/coach/link').catch(()=>null)
    ]);
    if(h.user&&app.globalData.home&&app.globalData.home.user)app.globalData.home.user=h.user;
    try{wx.setStorageSync&&wx.setStorageSync('Somarise.accountCache',{user:h.user,link:h.link});}catch(e){}
    // 教练码只给教练取。会员这边连请求都不发，也就不会有「半张空卡」
    const isCoach=!!(access&&access.isCoach);
    app.globalData.isCoach=isCoach;
    try{wx.setStorageSync&&wx.setStorageSync('Somarise.isCoach',isCoach);}catch(e){}
    let invite='';
    if(isCoach){try{invite=((await api('/coach/invite'))||{}).code||'';}catch(e){}}
    const r=link&&link.link;
    this.setData({
      loaded:true,user:h.user,link:h.link,
      accountAccess:access||{userId:h.user.id,isCoach:false,pending:true},
      isCoach,invite,
      coachLine:r?('已授权给 '+((r.coach&&r.coach.name)||'你的教练')):'还没有授权给任何教练'
    });
  },

  copyInvite(){
    const code=this.data.invite;
    if(!code)return;
    wx.setClipboardData({data:code});
  },

  copyAccount(){const id=this.data.accountAccess&&this.data.accountAccess.userId;if(id)wx.setClipboardData({data:id});},
  goals(){wx.navigateTo({url:'/pages/goals/goals'});},
  pickAvatar(){wx.navigateTo({url:'/pages/avatar/avatar'});},
  authorize(){wx.navigateTo({url:'/pages/authorize/authorize'});},
  onboard(){wx.navigateTo({url:'/pages/onboard/onboard'});},

  input(e){this.setData({code:e.detail.value});},
  consent(e){this.setData({consent:e.detail.value});},

  async profile(e){
    try{
      // 只改昵称：时区已经不上界面了，服务端保留原来的值
      await api('/profile','PATCH',{nickname:e.detail.value.nickname});
      change();
      await this.load();
      wx.showToast({title:'已保存'});
    }catch(err){error(err);}
  },

  async bind(){
    try{
      if(!this.data.consent)return;
      await api('/somaxis/link','POST',{code:String(this.data.code||'').trim(),consent:true});
      change();
      await this.load();
    }catch(err){error(err);}
  },

  async unbind(){
    try{
      await api('/somaxis/link','DELETE');
      change();
      await this.load();
    }catch(err){error(err);}
  },

  // 演示用：把这个虚构账号清回「刚进来」的样子，好看看新人第一次打开看到什么
  resetDemo(){
    if(this.data.resetting)return;
    wx.showModal({
      title:'重置为新人状态？',
      content:'这个账号的记录、项目、目标和学习进度都会被清空，然后重新走一遍新手引导。',
      confirmText:'清空',confirmColor:'#d9480f',
      success:async r=>{
        if(!r.confirm)return;
        this.setData({resetting:true});
        try{
          await api('/reset','POST');
          try{ wx.clearStorageSync&&wx.clearStorageSync(); }catch(e){}
          const app=getApp();app.globalData.token='';app.globalData.home=null;app.globalData.dirty=true;
          await login(app.globalData.demoUserId||'demo-a');
          wx.reLaunch({url:'/pages/home/home'});
        }catch(err){ this.setData({resetting:false}); error(err); }
      }
    });
  }
});
