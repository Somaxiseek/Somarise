// 项目标记：纯 CSS 画的几何形状，颜色用项目色。
// 不用 emoji / 图片：形状跟着色板走，缩小放大都不糊，也不带平台字体差异。
Component({
  properties:{
    shape:{type:String,value:'dot'},
    color:{type:String,value:'#171717'},
    // sm = 选择器里的小形状，md = 列表行，lg = 详情页头图
    size:{type:String,value:'md'},
    // 是否带一层同色浅底（色块），列表和详情页用；选择器里不要
    tint:{type:Boolean,value:true}
  }
});
