'use strict';
// 词库分类表：key → 中文名。
// 单独放一个小文件的原因：词库正文（words.js + words/ 目录，约 1.1MB）被
// project.config.json 的 packOptions.ignore 排除在主包外（词数据走云端接口），
// 客户端页面只需要这张 9 行的分类表 —— 学习范围的勾选浮层用。
// words.js 也从这里引，保证两处永远一致；新增分类只改这一个文件。
const CATS={
  training:'训练动作', anatomy:'身体部位', foot:'足与踝', nutrition:'营养饮食',
  health:'健康医学', daily:'日常常用', mind:'心理与习惯', science:'理化基础',
  philosophy:'科学哲学'
};
module.exports={CATS};
