// 说明文字统一收进标题旁的小圆点：点一下展开，再点一下收起，同一时间只开一个。
// 用法（页面 js）：
//   const tip=require('../../utils/tip');
//   Page({data:Object.assign({...},tip.data),toggleTip:tip.toggle})
// 用法（wxml）：
//   <view class="title-with-info">
//     <text class="section-title">标题</text>
//     <view class="info-dot {{tip==='key'?'info-dot-on':''}}" data-tip="key" bindtap="toggleTip" role="button" aria-label="说明">!</view>
//   </view>
//   <view wx:if="{{tip==='key'}}" class="info-pop">说明文字</view>
module.exports={
  data:{tip:''},
  toggle(e){
    const ds=(e&&e.currentTarget&&e.currentTarget.dataset)||{};
    const key=ds.tip||'';
    this.setData({tip:this.data.tip===key?'':key});
  },
  close(){this.setData({tip:''});}
};
