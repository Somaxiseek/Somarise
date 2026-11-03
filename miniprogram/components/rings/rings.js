// 同心环组件：环宽默认按尺寸自动算（够粗才像手表），也可以显式传 stroke 覆盖。
// 纯 WXSS 渲染（conic-gradient），不用 canvas —— canvas 是原生层，页面滚动时会浮在上面。
// 中心默认不写字：一环没闭时传空字符串，闭了第一环才传「1/3」。环加粗到 11.5% 以后
// 120px 的孔径只剩 28px，所以字号跟着收到 0.11（15 → 13），别再往上加。
const {arcList, strokeFor, gapFor} = require('../../utils/arcs');

Component({
  properties:{
    values:{type:Array,value:[]},
    size:{type:Number,value:120},
    stroke:{type:Number,value:0},      // 0 = 按 size 自动（size*11.5%）
    gap:{type:Number,value:0},         // 0 = 按 size 自动（size*2%）
    center:{type:String,value:''},
    bg:{type:String,value:'#ffffff'}   // 挖洞用的底色，要和圆环所在卡片的背景一致
  },
  data:{arcs:[],numFont:16},
  observers:{
    'values,size,stroke,gap,bg':function(){this.build();}
  },
  lifetimes:{ready(){this.build();}},
  methods:{
    build(){
      const size=Number(this.data.size)||120;
      const stroke=Number(this.data.stroke)>0?Number(this.data.stroke):strokeFor(size);
      const gap=Number(this.data.gap)>0?Number(this.data.gap):gapFor(size);
      this.setData({
        arcs:arcList(this.data.values,size,stroke,gap,this.data.bg),
        numFont:Math.max(9,Math.round(size*0.11))
      });
    }
  }
});
