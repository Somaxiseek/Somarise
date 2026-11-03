const { api, error } = require('../../utils/api');
const { board, intensityMix, heatmap, profileStats } = require('../../utils/cycles');
const tip = require('../../utils/tip');

// 热力图上方那句话：按当前视图（周 / 月 / 年）说「你已经做到多少」。
// 鼓励式口径（用户 10-30）：先报成绩（「这周已经运动了 2 天」），不摆 N/M、
// 不解释规则；闭环了才换庆祝款。没达成就轻描淡写，不催、不报落后。
function cheerOf(view, s) {
  s = s || {};
  if (view === 'week') {
    if (s.weekClosed) {
      return { on: true, title: '本周完成', sub: s.goalCount + ' 项目标都到线，这一周收工。' };
    }
    if (!s.weekActive) {
      return { on: false, title: '这周还空着', sub: '想动的时候随时开始，之前记下的都还在。' };
    }
    return { on: false, title: '这周已经运动了 ' + s.weekActive + ' 天', sub: '动一次记一次，都算数。' };
  }
  if (view === 'month') {
    const m = s.month || { total: 0, completed: 0 };
    if (m.total && m.completed === m.total) {
      return { on: true, title: '本月集齐', sub: m.total + ' 个自然周全部闭环，月度奖章到手。' };
    }
    if (m.completed > 0) {
      return { on: false, title: '这个月已经闭环 ' + m.completed + ' 周', sub: '一周一周攒，不着急。' };
    }
    return { on: false, title: '这个月刚开始', sub: '记上一天算一天，闭环会跟着来。' };
  }
  // 年
  if (!s.activeDays) {
    return { on: false, title: '这一年还空着', sub: '第一笔记录会落在这里，什么时候开始都不晚。' };
  }
  const bits = [];
  if (s.yearClosed) bits.push('闭环 ' + s.yearClosed + ' 周');
  bits.push('最长连续 ' + s.longest + ' 天');
  if (s.best) bits.push(s.best.m + ' 月最勤（' + s.best.v + ' 天）');
  return { on: s.yearClosed > 0, title: '这一年已经动了 ' + s.activeDays + ' 天', sub: bits.join(' · ') };
}

Page({
  // 周期看板 = 我的看板：个人卡（我是谁、攒了多少）→ 本周目标 → 回顾（热力图 + 强度饼）。
  // 2026-10-30 起「本月 / 近12周 / 近半年 / 近1年」四张闭环周数卡删掉了，
  // 那些数已经由热力图讲得更直观；闭环周数改在热力图上方那句话里报。
  data: Object.assign({
    loaded: false,
    today: '',
    weekStart: '',
    weekEnd: '',
    weekRange: '',
    weekGoals: [],
    weekClosed: false,
    anyWeekly: false,
    windows: [],
    heatView: 'year',
    heat: { columns: [], monthLabels: [], stats: { activeDays: 0, longest: 0, current: 0 }, week: [], weekActive: 0, month: [] },
    cheer: { on: false, title: '', sub: '' },
    intensity: [],
    intensityTotal: 0,
    pieStyle: '',
    user: { nickname: '', avatar: '' },
    meta: '',
    coach: false,
    meStats: []
  }, tip.data),
  toggleTip(e) { tip.toggle.call(this, e); },

  onShow() {
    // 教练身份由「我的」页加载时写进 globalData / 本地存储；没有就当会员。
    let coach = false;
    try { coach = !!(getApp().globalData.isCoach || wx.getStorageSync('Somarise.isCoach')); } catch (e) { coach = false; }
    if (coach !== this.data.coach) this.setData({ coach });
    this.load();
  },

  // 切视图时那句话跟着换（数据已经在手，不重新联网）
  setHeatView(e) {
    const v = e.currentTarget.dataset.v;
    this.setData({ heatView: v, cheer: cheerOf(v, this._sum) });
  },
  openAvatar() { wx.navigateTo({ url: '/pages/avatar/avatar' }); },
  openAchievements() { wx.navigateTo({ url: '/pages/achievements/achievements' }); },
  openCoach() { wx.navigateTo({ url: '/pages/coach/coach' }); },

  async load() {
    try {
      const app = getApp();
      let home = app.globalData.home;
      // 改过资料（换头像、改昵称、调环颜色）会把 globalData.dirty 置起来。
      // 这里原来只判 home 在不在，于是「保存完回来头像没变」——缓存里的 user 还是旧的。
      if (!home || !home.goals || app.globalData.dirty) {
        home = await api('/home');
        app.globalData.home = home;
        app.globalData.dirty = false;
      }
      const t = intensityMix(home);
      const heat = heatmap(home);
      const ps = profileStats(home);
      const b = board(home);
      const u = home.user || {};

      // 柱图下面只留数据、不留说明（用户 10-30：图自己会说话）。
      // 周视图的小字整行删掉；月视图只留「最勤的月」这一条数据。
      heat.monthCap = heat.bestMonth ? heat.bestMonth.m + ' 月最勤：' + heat.bestMonth.v + ' 天' : '';

      // 上面那句话要用的几个数：切视图时只重拼文案，不重新算、不重新请求
      const monthWindow = b.windows.filter(w => w.key === 'month')[0] || { total: 0, completed: 0 };
      const yearWindow = b.windows.filter(w => w.key === 'year')[0] || { completed: 0 };
      this._sum = {
        weekClosed: b.weekClosed,
        goalCount: b.weekGoals.length,
        weekActive: heat.weekActive,
        activeDays: heat.stats.activeDays,
        longest: heat.stats.longest,
        yearClosed: yearWindow.completed,
        month: { total: monthWindow.total, completed: monthWindow.completed },
        best: heat.bestMonth
      };

      // 昵称下面那行：不摆 @openid（wx_ 开头的编号看着像乱码），
      // 改成「加入第 N 天」——信息是真的，也不带计时器那种压迫感。
      const joined = u.createdAt ? Date.parse(u.createdAt) : 0;
      const joinedDays = joined ? Math.max(1, Math.floor((Date.now() - joined) / 86400000) + 1) : 0;

      // 5 格统计：数字 + 单位 + 标签（对齐参考图那排「累计 / 峰值 / 最长 / 当前」）
      // 运动时长满 60 分钟换成小时；<10 小时留一位小数（90 分 = 1.5 时），再大就取整。
      const h = ps.totalMin / 60;
      const asHours = ps.totalMin >= 60;
      const hoursTxt = h >= 10 ? String(Math.round(h)) : String(Math.round(h * 10) / 10);
      // 强度饼：conic-gradient 的角度在这里拼（值 → 累计百分比 → 色标段）。
      // 0 次的那档不画，否则会多出一条零宽度的色标。
      const stops = [];
      let acc = 0;
      t.intensity.forEach(it => {
        if (!it.value) return;
        const from = acc;
        acc += it.value / (t.intensityTotal || 1) * 100;
        stops.push(it.color + ' ' + from.toFixed(2) + '% ' + acc.toFixed(2) + '%');
      });
      const pieStyle = stops.length ? 'background: conic-gradient(' + stops.join(',') + ');' : '';

      this.setData(Object.assign({ loaded: true }, b, {
        intensity: t.intensity,
        intensityTotal: t.intensityTotal,
        pieStyle,
        heat,
        cheer: cheerOf(this.data.heatView, this._sum),
        user: { nickname: u.nickname || '你', avatar: u.avatar || '' },
        meta: joinedDays ? '加入第 ' + joinedDays + ' 天' : 'Somarise',
        meStats: [
          { k: 'days', n: String(ps.totalDays), u: '天', l: '累计记录' },
          { k: 'time', n: asHours ? hoursTxt : String(ps.totalMin), u: asHours ? '时' : '分', l: '运动时长' },
          { k: 'best', n: String(ps.bestDay), u: '分', l: '单日最长' },
          { k: 'longest', n: String(heat.stats.longest), u: '天', l: '最长连续' },
          { k: 'current', n: String(heat.stats.current), u: '天', l: '当前连续' }
        ]
      }));
    } catch (e) { error(e); }
  },

});
