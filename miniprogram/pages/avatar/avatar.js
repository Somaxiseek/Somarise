const { api, error, change } = require('../../utils/api');
const { AVATARS } = require('../../data/pixel-avatars');

// 头像是成品圆图（圆底+动物一张图，圆外透明），切自用户确认的参考拼图，
// 动物在圆里的占比/基线在源图里就统一好了，页面只负责摆位置。

// 顺序已在 pixel-avatars 里定好：8 猫 / 4 狗 / 8 其他，正好三组。
const GROUPS = [
  { title: '猫咪', items: AVATARS.slice(0, 8) },
  { title: '狗狗', items: AVATARS.slice(8, 12) },
  { title: '其他动物', items: AVATARS.slice(12, 20) }
];

// 挑头像：预设 20 款动物头像，不做上传。
// 上传要走对象存储 + mediaCheckAsync 内容审核（UGC 图片是硬性要求），个人主体做这块风险高；
// 预设头像零存储零审核，随时能换，也不会有人往健身记录里传奇怪的照片。
Page({
  data: {
    groups: GROUPS,
    current: '',
    nickname: '',
    saving: false
  },

  async onLoad() {
    try {
      let home = getApp().globalData.home;
      if (!home || !home.user) home = await api('/home');
      const u = home.user || {};
      this.setData({
        current: String(u.avatar || '').replace(/^px:/, ''),
        nickname: u.nickname || ''
      });
    } catch (e) { error(e); }
  },

  pick(e) { this.setData({ current: e.currentTarget.dataset.id }); },
  clear() { this.setData({ current: '' }); },

  async save() {
    // 用实例上的 _busy 挡重复点击，而不是 data.saving：成功后按钮要能恢复，
    // 万一 navigateBack 失败（比如从分享直接进来没有上一页），页面不能卡在「正在保存…」。
    if (this._busy) return;
    this._busy = true;
    this.setData({ saving: true });
    try {
      const want = this.data.current ? 'px:' + this.data.current : '';
      const u = await api('/profile', 'PATCH', { nickname: this.data.nickname, avatar: want });
      // 服务端返回的 user 才是真存进去的东西。老版本云函数只认昵称、把 avatar 悄悄丢掉，
      // 接口仍然回 200 —— 那种情况下不能报「已换好」，否则用户换了三次也看不到头像。
      if (u && String(u.avatar || '') !== want) throw new Error('头像没存上，请稍后再试');
      // 顺手把缓存里的自己更新掉：看板/设置页 onShow 时能立刻用上新头像，
      // 不用等它们各自重新拉一次 /home。
      const app = getApp();
      if (app.globalData.home && app.globalData.home.user) {
        app.globalData.home.user = Object.assign({}, app.globalData.home.user, u);
      }
      change();
      this._busy = false;
      this.setData({ saving: false });
      wx.showToast({ title: '已换好' });
      // 保存完就回上一页（看板/我的），不用再手动点返回。
      // 万一这一页是被 reLaunch 直接打开的（栈里只有它自己），回退会失败 —— 那就落到看板，
      // 总之不能让用户停在头像页上出不去。
      setTimeout(() => {
        if (getCurrentPages().length > 1) wx.navigateBack();
        else wx.reLaunch({ url: '/pages/cycle/cycle' });
      }, 600);
    } catch (e) {
      this._busy = false;
      this.setData({ saving: false });
      error(e);
    }
  }
});
