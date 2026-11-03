// 头像渲染：把 'px:grey' 之类的 id 换成包里的一张图。
// 页面只传 name 和 size（rpx），不关心图从哪来。
//
// 历史：前两版这里是把字符网格展开成绝对定位的小方块（10×10 → 24×24），
// 一天要渲染上千个 view。改成成品图后一个 <image> 就够，也省掉了格子对齐的麻烦。
const { get } = require('../../data/pixel-avatars');

Component({
  properties: {
    name: { type: String, value: '' },
    size: { type: Number, value: 160 },
    // 没有头像（或 id 无效）时显示的字，一般传昵称，组件取首字
    fallback: { type: String, value: '' }
  },

  data: {
    src: '',
    letter: ''
  },

  observers: {
    // 两个属性一起看：只变其中一个时也只重建一次
    'name, fallback': function (n, f) { this._build(n, f); }
  },

  lifetimes: {
    attached() { this._build(this.data.name, this.data.fallback); }
  },

  methods: {
    _build(name, fallback) {
      const av = get(name);
      if (!av) {
        this.setData({ src: '', letter: String(fallback || '').trim().slice(0, 1) });
        return;
      }
      this.setData({ src: av.src, letter: '' });
    }
  }
});
