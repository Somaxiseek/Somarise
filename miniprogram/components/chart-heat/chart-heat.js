// 日历热力图的网格。数据（columns / monthlabels）由 utils/cycles.js 的 heatmap() 算好，
// 这里只管铺格子 + 开局滚到最右边（最近的日子），不重算任何口径。
//
// 宽度必须自己算死：scroll-view 里的行内块会被压回 100% 宽，flex 再把 53 列均分，
// 一格只剩 5px，整年挤成一团马赛克、也滑不动。所以按「格宽 + 间距」算出总宽写进 style。
const CELL = 18;   // 一格 18rpx ≈ 9px
const GAP = 4;     // 列间距 4rpx

Component({
  properties: {
    columns: { type: Array, value: [] },
    monthlabels: { type: Array, value: [] },
    // 每一列（一周）是否闭环：1 = 闭环，网格下面点亮一颗小星
    marks: { type: Array, value: [] },
    // 今天在哪一列：年网格铺满整年后，最右是 12 月的未到日子，
    // 开局要停在「今天」的列上，而不是最右（heatmap() 算好传进来）
    focus: { type: Number, value: -1 }
  },

  data: { scrollLeft: 0, gridW: 0 },

  observers: {
    columns() { this._size(); this._toLatest(); },
    focus() { this._toLatest(); }
  },

  lifetimes: {
    // attached 再算一次：属性在组件创建时就已经带上，observer 不一定会补一次
    attached() { this._size(); },
    ready() { this._size(); this._toLatest(); }
  },

  methods: {
    _size() {
      const n = (this.data.columns || []).length;
      const w = n ? n * CELL + (n - 1) * GAP : 0;
      if (w !== this.data.gridW) this.setData({ gridW: w });
    },
    // 网格比屏宽，默认停在「今天」那一列（focus 居中）。量完宽度再设 scroll-left，
    // 不设的话用户进来看到的是 1 月，得自己滑半天。focus 没给才退回最右。
    _toLatest() {
      const run = () => {
        const q = this.createSelectorQuery();
        q.select('.ch-body').boundingClientRect();
        q.select('.ch-scroll').boundingClientRect();
        q.exec(res => {
          const body = res && res[0] && res[0].width;
          const box = res && res[1] && res[1].width;
          if (!body || !box || body <= box) return;
          const focus = Number(this.data.focus);
          const left = focus >= 0
            ? focus * (CELL + GAP) + CELL / 2 - box / 2          // 今天的列居中
            : body - box + 8;
          this.setData({ scrollLeft: Math.max(0, left) });
        });
      };
      if (wx.nextTick) wx.nextTick(run); else setTimeout(run, 30);
    }
  }
});
