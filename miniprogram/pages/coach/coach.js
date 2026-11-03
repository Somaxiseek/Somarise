const { api, error } = require('../../utils/api');

// 教练端：只放「会员看板」。
//  - 教练自己的看板在底部「看板」里（pages/cycle，个人卡 + 热力图 + 饼图），
//    以前这里有个「我的周期看板」页签，用的是旧 cycle-board 组件，两边长得不一样，
//    教练反而以为新看板没做——2026-10-30 整块删掉。
//  - 会员周期看板（总看板）：横轴是人，日 / 周 / 月 / 年 四档
//
// 总看板有两种看法，默认「按项目看」：
//   一个项目一张卡，卡里是一张柱状图，**横轴是每一个人**（像排行榜，谁完成谁没有一眼看见）。
//   五张卡：有氧 / 抗阻 / 饮水 / 体重变化 / 腰围变化。日、周、月、年四档都是这个视图。
// 第二种「按人看」：一个人一张卡（三条进度条 + 体测变化量），点进去就是个人页。
const PERIODS = [{ v: 'day', label: '日' }, { v: 'week', label: '周' }, { v: 'month', label: '月' }, { v: 'year', label: '年' }];
// 柱子的刻度：0–150%（喝超了、练超了都要画得出来），100% 那条虚线就是「达标」
const SCALE = 150;
// 柱子区（.col-slot）高 200rpx，名字+副标题那块固定 64rpx。
// 虚线要画在「柱子区」里，不能按整张图的高度算百分比 —— 名字长短一变就飘。
const SLOT_H = 200;
const LABEL_H = 64;
// 纵轴刻度都贴在柱子区上：bottom 是相对柱子区底部的百分比
function pctTicks() {
  return [150, 100, 50, 0].map(v => ({ v: v + '%', b: Math.round(v / SCALE * 1000) / 10 }));
}
const CHARTS = [
  { key: 'cardio', label: '有氧', note: '按各自的周目标折算，虚线 = 达标' },
  { key: 'strength', label: '抗阻', note: '按各自的周目标折算，虚线 = 达标' },
  { key: 'water', label: '饮水', note: '每天百分比的平均，虚线 = 天天达标' },
  { key: 'weight', label: '体重', unit: 'kg', note: '变化量（较上一周期），中线 = 没变' },
  { key: 'waist', label: '腰围', unit: 'cm', note: '变化量（较上一周期），中线 = 没变' }
];

function fmtDelta(v) {
  if (v == null) return '—';
  const r = Math.round(v * 10) / 10;
  return (r > 0 ? '+' : '') + r;
}
// 刻度上的数字：一位小数就够，0.0 写成 0
function fmtTick(v) {
  const r = Math.round(v * 10) / 10;
  return String(r);
}
// 进度条宽度：值 ÷ 目标，封顶 100%；没目标返回 null（不画）
function pctOf(value, target) {
  if (value == null || target == null || !(target > 0)) return null;
  return Math.max(0, Math.min(100, Math.round(value / target * 100)));
}
// 一张卡里的三条条形：label 上色提示，条按目标画，右边一行真实数字
function rowsOf(m) {
  const t = (m && m.targets) || {};
  const c = m.cardio || {};
  const s = m.strength || {};
  const w = m.water || {};
  const body = m.body || {};
  return {
    rows: [
      {
        key: 'cardio', label: '有氧', cls: 'bar-cardio',
        pct: pctOf(c.minutes || 0, t.cardio),
        text: (c.sessions || 0) > 0 ? c.sessions + ' 次 · ' + (c.minutes || 0) + ' 分' : '还没动',
        has: (c.sessions || 0) > 0
      },
      {
        key: 'strength', label: '抗阻', cls: 'bar-strength',
        pct: pctOf(s.days || 0, t.strength),
        text: (s.sessions || 0) > 0 ? '练 ' + (s.days || 0) + ' 天 · ' + s.sessions + ' 次' : '还没练',
        has: (s.sessions || 0) > 0
      },
      {
        key: 'water', label: '饮水', cls: 'bar-water',
        pct: w.avgPercent == null ? null : Math.min(100, w.avgPercent),
        text: w.avgPercent == null ? '还没记' : w.avgPercent + '%' + (w.days ? ' · 达标 ' + w.metDays + '/' + w.days : ''),
        has: w.avgPercent != null
      }
    ],
    weight: { text: body.weight && body.weight.delta != null ? fmtDelta(body.weight.delta) + ' kg' : '—', sub: (body.weight && body.weight.text) || '' },
    waist: { text: body.waist && body.waist.delta != null ? fmtDelta(body.waist.delta) + ' cm' : '—', sub: (body.waist && body.waist.text) || '' }
  };
}

// 图轴上叫什么：教练写的备注优先（用户 10-30）——微信昵称经常认不出人，
// 教练备注的就是 TA 心里那个名字；没备注退回授权称呼
function nameOf(m) { return m.remark || m.name || '会员'; }

// ── 按项目看：一张卡一个项目，卡里每个人一根柱子（横轴是人）──────────────
// 有目标 → 柱子高度是完成百分比（0–150% 刻度，100% 画虚线）；
// 没目标（仅记录）→ 柱子按组内最高的那个人归一化，画成淡色，只报绝对值，不冒充百分比。
function goalBars(members, pick) {
  const raw = members.map(m => Number(pick.value(m)) || 0);
  const peak = Math.max(1, ...raw);
  return members.map((m, i) => {
    const v = raw[i];
    const target = Number(pick.target(m)) || 0;
    const bar = { id: m.id, name: nameOf(m), muted: false, h: 0, top: '', sub: '', show: false };
    // 一次都没记：给「—」而不是 0%。没记和「记了 0」是两件事，别拿 0% 判人
    if (v === 0) {
      bar.muted = true;
      bar.top = '—';
      bar.sub = pick.empty ? pick.empty(m) : '没记';
      return bar;
    }
    if (target > 0) {
      const pct = Math.round(v / target * 100);
      bar.h = Math.min(100, Math.round(pct / SCALE * 100));
      bar.top = pct + '%';
    } else {
      bar.muted = true;
      bar.h = v > 0 ? Math.round(v / peak * 55) : 0; // 淡柱按绝对值画，只到半腰，不冒充百分比
      bar.top = v > 0 ? pick.text(m) : '—';
    }
    bar.sub = pick.text(m);
    bar.show = bar.h > 0;
    return bar;
  });
}

// 体测变化量：有正有负，所以是双向柱——零线在中间，上面是涨，下面是降
function deltaBars(members, key, unit) {
  const vals = members.map(m => {
    const b = (m.body || {})[key] || {};
    return b.delta == null ? null : Number(b.delta);
  });
  const peak = Math.max(0.5, ...vals.map(v => Math.abs(v || 0)));
  return members.map((m, i) => {
    const b = (m.body || {})[key] || {};
    const v = vals[i];
    if (v == null) {
      return { id: m.id, name: nameOf(m), muted: true, h: 0, dir: 'none', top: '', sub: (b && b.text) || '', show: false };
    }
    return {
      id: m.id,
      name: nameOf(m),
      muted: false,
      dir: v > 0 ? 'up' : (v < 0 ? 'down' : 'flat'),
      h: Math.round(Math.abs(v) / peak * 50),
      top: '',
      sub: fmtDelta(v) + ' ' + unit,
      show: v !== 0
    };
  });
}

// 双向柱的纵轴刻度要用「这组人里最大的那个变化量」，跟柱子归一化的 peak 保持一致
function deltaPeak(members, key) {
  return members.reduce((p, m) => {
    const b = (m.body || {})[key] || {};
    return b.delta == null ? p : Math.max(p, Math.abs(Number(b.delta) || 0));
  }, 0);
}

function chartsOf(members) {  return CHARTS.map(c => {
    let bars;
    if (c.key === 'cardio') {
      bars = goalBars(members, {
        value: m => (m.cardio || {}).minutes || 0,
        target: m => (m.targets || {}).cardio,
        text: m => ((m.cardio || {}).minutes || 0) + ' 分',
        empty: () => '还没动'
      });
    } else if (c.key === 'strength') {
      bars = goalBars(members, {
        value: m => (m.strength || {}).days || 0,
        target: m => (m.targets || {}).strength,
        text: m => ((m.strength || {}).days || 0) + ' 天',
        empty: () => '还没练'
      });
    } else if (c.key === 'water') {
      bars = members.map(m => {
        const w = m.water || {};
        const bar = { id: m.id, name: nameOf(m), muted: false, h: 0, top: '', sub: '', show: false };
        if (w.avgPercent == null) {
          bar.muted = true;
          bar.top = '—';
          bar.sub = '还没记';
        } else {
          bar.h = Math.min(100, Math.round(w.avgPercent / SCALE * 100));
          bar.top = w.avgPercent + '%';
          bar.sub = (w.ml || 0) + ' ml';
        }
        bar.show = bar.h > 0;
        return bar;
      });
    } else {
      bars = deltaBars(members, c.key, c.unit);
    }
    const bipolar = c.key === 'weight' || c.key === 'waist';
    // 100% 那条虚线在刻度里的位置（体测是双向柱，中线就是零线）
    const line = bipolar ? 50 : Math.round(100 / SCALE * 100);
    // 纵轴刻度：前三张是完成度 0–150%，体测是 ±变化量（0 在中间）。
    // 没有绝对量纲的东西（变化量）必须把刻度写成 ±数字，否则「柱子多高」没法解读。
    let yTicks = pctTicks();
    let axisCap = '纵轴 = 完成度（本周期 ÷ 各自目标）：0% 是底线，虚线 100% = 达标，最高画到 150%。';
    if (bipolar) {
      const peak = Math.max(0.5, deltaPeak(members, c.key));
      yTicks = [
        { v: '+' + fmtTick(peak), b: 100 },
        { v: '0', b: 50 },
        { v: '−' + fmtTick(peak), b: 0 }
      ];
      axisCap = '纵轴 = 较上一周期的变化量（' + c.unit + '）。中间那条实线是 0：往上变多是涨、往下变少是降。';
    }
    return {
      key: c.key,
      label: c.label,
      note: c.note,
      cls: 'bar-' + c.key,
      bipolar,
      line,
      // 虚线的实际位置：柱子区高 200rpx，下面还压着 64rpx 的名字区
      lineRpx: Math.round(LABEL_H + line * SLOT_H / 100),
      yTicks,
      axisCap,
      bars
    };
  });
}

// 两种视图的数据都在前端算：服务端只给「一人一份事实」，怎么排是视图的事
function viewOf(members, period) {
  const cards = members.map(m => {
    const built = rowsOf(m);
    const daysText = period === 'day'
      ? ((m.recordedDays || 0) > 0 ? '今天已记录' : '今天没记录')
      : '记录 ' + (m.recordedDays || 0) + '/' + (m.days || 0) + ' 天';
    return {
      id: m.id,
      name: m.name || '会员',
      remark: m.remark || '',
      authorizedAt: String(m.authorizedAt || '').slice(0, 10),
      daysText,
      rows: built.rows,
      weight: built.weight,
      waist: built.waist
    };
  });
  // 训练结构（乐高柱）的行数据：每人一根细条，按类别分段。
  // 段宽 = 该类别次数 ÷ 总次数；一条没记就给空条，写「未记录」。
  const mixRows = members.map(m => {
    const mix = m.mix || [];
    const total = mix.reduce((a, b) => a + (b.count || 0), 0);
    const segs = mix.map(x => ({
      label: x.label,
      color: x.color,
      count: x.count,
      pct: total ? Math.round((x.count || 0) / total * 1000) / 10 : 0
    }));
    return { id: m.id, name: nameOf(m), total, segs };
  });
  return { cards, charts: chartsOf(members), mixRows };
}

Page({
  data: {
    periods: PERIODS,
    period: 'week',
    members: [],
    board: null,
    charts: [],
    cards: [],
    mixRows: [],
    mode: 'metric',
    rangeText: '',
    counts: ''
  },

  onShow() { this.load(); },

  // 教练码不在这里了（2026-10-30）：它是「我的账号」的东西，不是会员看板的一部分，
  // 搬去「我的 → 教练码」，只有教练账号才看得到。这里只负责看会员。
  async load() {
    try {
      await this.loadBoard();
    } catch (e) { error(e); }
  },

  async loadBoard() {
    const period = this.data.period;
    const data = await api('/coach/board?period=' + period);
    const members = (data && data.members) || [];
    const range = data && data.range;
    const active = members.filter(m => (m.recordedDays || 0) > 0).length;
    this.setData(Object.assign({
      board: data,
      members,
      rangeText: range ? range.label : '',
      counts: members.length ? members.length + ' 位会员 · ' + active + ' 位在这段时间里有记录' : ''
    }, viewOf(members, period)));
  },

  // 用现在手里的会员数据重算两种视图（不联网）。截图/调试喂数据也走这条
  refresh() { this.setData(viewOf(this.data.members, this.data.period)); },

  // 两种看法：按项目（一张卡一个项目，横轴是人）/ 按人（一人一张卡）
  setMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }); },

  async pickPeriod(e) {
    const v = e.currentTarget.dataset.v;
    if (!v || v === this.data.period) return;
    this.setData({ period: v });
    try { await this.loadBoard(); } catch (err) { error(err); }
  },

  openMember(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/member/member?id=' + id + '&name=' + encodeURIComponent(name || '') });
  },

  // 备注（用户 10-30）：微信昵称认不出人，教练给会员记个真名/标签，只有教练自己看得到。
  // 图轴和训练结构里备注优先；会员本人的任何页面都不会出现这条备注。
  editRemark(e) {
    const { id, name, remark } = e.currentTarget.dataset;
    wx.showModal({
      title: '备注 · ' + (name || '这位会员'),
      content: remark ? '当前备注：' + remark : '只有你能看到，会员看不到。',
      editable: true,
      placeholderText: '例如真实姓名或怎么称呼（30 字以内）',
      confirmText: '保存',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api('/coach/members/' + id + '/remark', 'PATCH', { remark: (r.content || '').trim() });
          await this.loadBoard();
        } catch (err) { error(err); }
      }
    });
  },

  // 空态里那句「教练码在「我的」里」：直接把人送过去，省得自己找
  openAccount() { wx.reLaunch({ url: '/pages/account/account' }); },

  // 解除关联：只断开关联，会员的记录是 TA 自己的，教练删不掉
  unlink(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '解除与' + (name || '这位会员') + '的授权？',
      content: '解除后你看不到 TA 的看板，TA 的记录一条都不会删。TA 随时可以用你的教练码重新授权。',
      confirmText: '解除',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api('/coach/members/' + id, 'DELETE');
          await this.loadBoard();
        } catch (err) { error(err); }
      }
    });
  }
});
