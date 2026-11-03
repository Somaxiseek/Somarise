// 常驻底部导航：打卡 / 学习 / 看板 / 我的。
// 成就不再是独立 tab（2026-10-30）：入口收进看板页右上角的角标。
// 圈子 / 排行榜已下线（2026-10-30）：社交留在微信群里，App 只做「记录 + 看见自己的变化」。
// current: log | learn | cycle | coach | account（二级页面传空字符串）
const ROUTES = {
  log: '/pages/home/home',
  learn: '/pages/learn/learn',
  cycle: '/pages/cycle/cycle',
  account: '/pages/account/account'
};

function routeOf(page) { return (page && page.route) || ''; }

Component({
  properties: {
    current: { type: String, value: '' }
  },

  data: {},

  methods: {
    jump(key) {
      const pages = getCurrentPages();
      const top = pages[pages.length - 1];
      const target = ROUTES[key].slice(1);

      // 已经在本模块：交给页面自己处理（首页需要切回「打卡」视图）
      if (routeOf(top) === target) {
        this.triggerEvent('same', { key });
        return;
      }

      // 2026-11-02 用户定稿：点「打卡」只回首页停住，不再自动开记录页。
      // 直达式（带 ?log=1 自动进表单）让用户觉得「自己跳出了心肺页面」，
      // 改成停在首页，由用户自己点项目/类别进表单——多一步，但主动感更强。
      if (key === 'log') {
        wx.reLaunch({ url: ROUTES.log });
        return;
      }

      // 其余模块：重置页面栈，避免越点越深
      wx.reLaunch({ url: ROUTES[key] });
    },

    tapLog() { this.jump('log'); },
    tapLearn() { this.jump('learn'); },
    tapAccount() { this.jump('account'); },

    // 中间的「看板」= 自己的看板，教练也一样（以前按身份分流，教练永远进不了自己的新看板）。
    // 教练端改从看板页标题行的「教练端」角标进，见 pages/cycle。
    tapBoard() { this.jump('cycle'); }
  }
});
