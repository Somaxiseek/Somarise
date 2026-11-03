const { api, error } = require('../../utils/api');

// 教练授权：关联只能从这里建立。
// 教练在 App 里手填一个名字建不出账号，所以改成「会员本人输入教练码 + 同意」。
// 授权只放出看板那部分数据（周目标进度、周期闭环、最近打卡），体测和学习不分享。
Page({
  data: {
    loaded: false,
    link: null,
    coach: null,
    authorizedAt: '',
    code: '',
    name: '',
    consent: false,
    saving: false
  },

  onShow() { this.load(); },

  async load() {
    try {
      const [r, h] = await Promise.all([api('/coach/link'), api('/home')]);
      const nick = (h && h.user && h.user.nickname) || '';
      const link = r.link || null;
      this.setData({
        loaded: true,
        link,
        coach: r.coach || null,
        authorizedAt: link && link.authorizedAt ? String(link.authorizedAt).slice(0, 10) : '',
        // 称呼默认取昵称（「新成员」是系统给的占位，不值得预填）
        name: this.data.name || (nick && nick !== '新成员' ? nick : '')
      });
    } catch (e) { error(e); }
  },

  onCode(e) { this.setData({ code: e.detail.value }); },
  onName(e) { this.setData({ name: e.detail.value }); },
  onConsent(e) { this.setData({ consent: !!e.detail.value }); },

  async submit() {
    if (this.data.saving || !this.data.consent) return;
    const code = String(this.data.code || '').trim();
    if (!code) { wx.showToast({ title: '先填教练码', icon: 'none' }); return; }
    this.setData({ saving: true });
    try {
      await api('/coach/link', 'POST', { code, name: String(this.data.name || '').trim(), consent: true });
      getApp().globalData.dirty = true;
      await this.load();
      wx.showToast({ title: '已授权', icon: 'none' });
    } catch (e) { error(e); } finally { this.setData({ saving: false }); }
  },

  revoke() {
    wx.showModal({
      title: '解除授权？',
      content: '解除后教练马上看不到你的看板。你的记录一条都不会删，想再分享随时可以重新授权。',
      confirmText: '解除',
      success: async r => {
        if (!r.confirm) return;
        try {
          await api('/coach/link', 'DELETE');
          getApp().globalData.dirty = true;
          await this.load();
        } catch (e) { error(e); }
      }
    });
  }
});
