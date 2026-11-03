// 单环进度（分类卡片右侧的小环）。沿用大环 rings 组件的同一套画法：
// 用 conic-gradient 画弧（12 点起、顺时针），弧的两个端点用「与圆环等宽的圆点」补齐，
// 这样端点就是圆头的——既满足「圆润端点覆盖起点」，又不靠 canvas（canvas 是原生层，
// 页面滚动时会浮在内容上面，已经被否掉）。
// 未达成：按实际完成比例显示弧；达成（≈100%）：整圈铺满 → 收掉中间的洞，变成「实心圆」。
// 这是用户 10-30 点名要的达标观感（此前重构时被改成闭合圆环，10-30 晚再补回）：
// 洞收成 0 就是实心盘；同时去掉端头圆点和它的阴影，否则盘面上会多一个深色小点。
// 不引入渐变 / 浮雕 / 发光；尺寸即坐标，按比例算，跨屏幕尺寸精确对齐。
const {fillFor,capAt,capShadowAt,hexToRgba}=require('../../utils/arcs');

Component({
  properties:{
    percent:{type:Number,value:0},
    size:{type:Number,value:72},
    label:{type:String,value:''},
    color:{type:String,value:'#111111'},
    bg:{type:String,value:'#ffffff'}
  },
  data:{box:64,stroke:5,hole:54,track:'#ededed',fill:'none',caps:[],numFont:12,labelColor:'#111111'},
  observers:{
    'percent,size,color':function(){this.build();}
  },
  lifetimes:{ready(){this.build();}},
  methods:{
    build(){
      const p=Math.max(0,Math.min(100,Number(this.data.percent)||0));
      const size=Number(this.data.size)||72;
      const stroke=size>100?8:5;          // 大环加粗，小环细一点，跟大环一个算法
      const box=size;
      const solid=p>=100;                  // 达标：实心圆（洞收成 0）
      const hole=solid?0:Math.max(0,box-stroke*2);
      const color=this.data.color||'#111111';
      const fill=fillFor(color,p);         // 0%→none；100%→实心；中间→conic 弧
      const track=hexToRgba(color,0.14);   // 未走完那截用本项颜色淡到 14%，更像手表
      // 起点永远无影；只有「头/终点」有影，且影落在头前进方向那一侧（12 点闭合时即正右方）。
      // 实心圆时整块都是实色，不需要端头，也不要那点阴影。
      const showCap=!solid&&p>0;
      const caps=showCap?[
        Object.assign({key:'start',head:false,color,dotSize:stroke,shadow:'none'},capAt(box,stroke,stroke,0)),
        Object.assign({key:'end',head:true,color,dotSize:stroke,shadow:capShadowAt(p*3.6,stroke)},capAt(box,stroke,stroke,p*3.6))
      ]:[];
      this.setData({
        box,stroke,hole,track,fill,caps,
        labelColor:solid?'#ffffff':'#111111',
        numFont:Math.max(9,Math.round(size*0.2))
      });
    }
  }
});
