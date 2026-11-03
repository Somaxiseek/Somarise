const {login,error}=require('../../utils/api');
const tip=require('../../utils/tip');

// 目标设置：运动/饮水/英语的卡片由 components/goal-set 渲染，跟新手引导最后一步共用，
// 这样两处的配色、说明和档位不会各写一套。
// 「学习页每天出几个新词」以前在这页另有一张卡，等于把「英语每天几个词」设了两遍：
// 存英语目标时服务端（goals.setGoal → learning.alignQuota）本来就会把出词配额对齐过去，
// 而那张卡只改配额、不改目标，两边不一致时英语环永远闭不上。现在只留英语那张卡。
Page({
  data:Object.assign({},tip.data),
  toggleTip(e){tip.toggle.call(this,e);},

  async onShow(){
    try{
      if(!getApp().globalData.token)await login();
      const gs=this.selectComponent&&this.selectComponent('#goalset');
      if(gs&&gs.load)await gs.load();
    }catch(e){error(e);}
  }
});
