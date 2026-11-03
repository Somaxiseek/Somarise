const { api, error } = require('../../utils/api');
const { TOKENS, WEEK } = require('../../utils/tokens');

// 教练点进某一位会员之后的页面：上面五张卡，下面一块可以左右滑的 banner，
// 一页一项，看它在每一天里的具体数值（像 Garmin 那个「重点关注」块）。
//
// 最短周期是**周**，这是刻意定的：五项里三项是「周均 / 较上周」的口径，
// 单日算不出平均；要看某一天的绝对值，回总看板切到日视图。
//
// 三条口径（用户点名）：
//   - 体测给的是**变化量**，不是绝对值；而且不是「今天减昨天」——先比本周期与上一周期的平均，
//     不够就退回最近两次的差。
//   - 周平均饮水百分比 = 每天百分比加起来 ÷ 有记录的天数，喝 2500/2000 就是 125%，不截到 100%。
//   - 心肺按等效分钟（中等 ×1、高强 ×2、低强照记分钟但不计训练量）。
const PERIODS = [{ v: 'week', label: '周' }, { v: 'month', label: '月' }, { v: 'year', label: '年' }];
const KIND = { cardio: 'bar', strength: 'bar', water: 'bar', weight: 'dot', waist: 'dot' };
const COLOR = { cardio: TOKENS.cardio, strength: TOKENS.strength, water: TOKENS.water, weight: TOKENS.body, waist: TOKENS.body };
const EMPTY_BAR = '#e8e8e8';
// 饮水柱的显示上限：150% 顶到上沿，再多也不画得更高；目标线就落在 100/150 处
const CAP = 150;

// 横轴标签从「今天」往回隔几个标一个：从左数会和最后一根柱子贴死
function labelAt(i, n, pointLabel) {
  const step = n <= 7 ? 1 : (n <= 14 ? 2 : 5);
  if ((n - 1 - i) % step !== 0) return '';
  return pointLabel || '';
}

function barsOf(metric, points) {
  const n = points.length;
  const values = points.map(p => Number(p.value) || 0);
  const max = metric.key === 'water' ? CAP : (metric.key === 'strength' ? Math.max(2, ...values) : Math.max(30, ...values));
  return points.map((p, i) => {
    const v = Number(p.value) || 0;
    const h = p.has ? Math.max(6, Math.min(100, Math.round(Math.min(v, max) / max * 100))) : 0;
    let color = COLOR[metric.key];
    if (metric.key === 'water' && p.has && v < 100) color = WEEK.water;
    if (!p.has) color = EMPTY_BAR;
    return { id: p.id, label: labelAt(i, n, p.label), h, color, text: p.text, has: p.has };
  });
}

function dotsOf(points) {
  const n = points.length;
  const vals = points.filter(p => p.has).map(p => Number(p.value));
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 0;
  // 最低/最高的点各留 8% 的余量，否则最轻的那天会贴在横轴上、看不出是个点
  const yOf = (v) => (max > min ? Math.round(8 + (v - min) / (max - min) * 84) : 50);
  return points.map((p, i) => {
    const y = p.has ? yOf(Number(p.value)) : null;
    return {
      id: p.id, label: labelAt(i, n, p.label),
      x: n > 1 ? Math.round(i / (n - 1) * 100) : 50,
      y, has: p.has, text: p.text
    };
  });
}

function buildView(data) {
  const metrics = (data.metrics || []).map(m => {
    const points = m.points || [];
    return Object.assign({}, m, {
      kind: KIND[m.key] || 'bar',
      color: COLOR[m.key] || TOKENS.body,
      bars: (KIND[m.key] || 'bar') === 'bar' ? barsOf(m, points) : [],
      dots: KIND[m.key] === 'dot' ? dotsOf(points) : [],
      // 明细从最近的一天往下排：教练打开就是想看这两天
      rows: points.slice().reverse().map(p => ({ label: p.label, text: p.text, has: p.has })),
      rangeText: (function () {
        const vals = points.filter(p => p.has).map(p => Number(p.value));
        if (!vals.length) return '这段时间还没有数据';
        return Math.min(...vals) + ' – ' + Math.max(...vals) + ' ' + (m.unit || '');
      })()
    });
  });
  return metrics;
}

Page({
  data: {
    id: '',
    name: '会员',
    remark: '',
    loaded: false,
    periods: PERIODS,
    period: 'week',
    rangeText: '',
    cards: [],
    strengthLine: '',
    metrics: [],
    tab: 0,
    goalLine: Math.round(100 / CAP * 1000) / 10
  },

  onLoad(o) {
    const name = o && o.name ? decodeURIComponent(o.name) : '';
    this.setData({ id: (o && o.id) || '', name: name || '会员' });
    this.load(name ? false : true);
  },

  async load(needName) {
    try {
      await this.loadPerson();
      if (needName) await this.fillName();
    } catch (e) {
      // 会员随时可能撤回授权：这时候不该弹「请求失败」，而是说清楚发生了什么
      if (e.status === 404) {
        wx.showModal({
          title: '这位会员已解除授权',
          content: 'TA 收回了看板分享，记录还在 TA 自己那边，你没有删掉任何东西。',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        return;
      }
      error(e);
    }
  },

  async loadPerson() {
    const data = await api('/coach/members/' + this.data.id + '/person?period=' + this.data.period);
    // 抗阻强度分布（2026-10-30）：TA 打卡时登记的低/中/高各几次，
    // 教练据此判断这一阵练得偏轻还是偏重，才知道怎么调整。
    const si = data.strengthIntensity || {};
    const siTotal = (si.low || 0) + (si.moderate || 0) + (si.vigorous || 0);
    this.setData({
      loaded: true,
      name: data.name || this.data.name,
      remark: data.remark || '',
      rangeText: data.label || '',
      // 百分号贴着数字写，kg / cm 才留空格：90% 不该显示成 90 %
      cards: (data.cards || []).map(c => Object.assign({}, c, {
        unit: c.unit && c.unit !== '%' ? ' ' + c.unit : c.unit
      })),
      strengthLine: siTotal ? '抗阻强度 · 低 ' + (si.low || 0) + ' · 中 ' + (si.moderate || 0) + ' · 高 ' + (si.vigorous || 0) : '',
      metrics: buildView(data),
      tab: 0
    });
  },

  async pickPeriod(e) {
    const v = e.currentTarget.dataset.v;
    if (!v || v === this.data.period) return;
    this.setData({ period: v, tab: 0 });
    try { await this.loadPerson(); } catch (err) { error(err); }
  },

  // 上面那排小标签和下面的 banner 是同一件事的两个入口，点哪边都跳到同一页
  pickMetric(e) {
    const i = Number(e.currentTarget.dataset.i);
    if (!isNaN(i)) this.setData({ tab: i });
  },
  onSwipe(e) {
    const i = e.detail && typeof e.detail.current === 'number' ? e.detail.current : 0;
    if (i !== this.data.tab) this.setData({ tab: i });
  },

  // 直接进来（没有带 name）时，从会员列表里补一个名字
  async fillName() {
    try {
      const list = await api('/coach/members');
      const me = (list || []).find(x => x.id === this.data.id);
      if (me) this.setData({ name: me.name });
    } catch (e) { /* 名字只是装饰，取不到就算了 */ }
  }
});
