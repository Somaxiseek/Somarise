# Somarise 交接说明（给接手的 AI / 开发者）

> 本文件是**唯一权威的接手入口**。`README.md` 写于 2026-10-26（项目刚起步时），部分描述已过时（它说"尚未部署"，实际已上云），有冲突以本文件为准。
> 最后更新：2026-11-03，对应开发版 0.2.22。

---

## 1. 这是什么

微信原生小程序 **Somarise**（内部代号 somactive / aerobic-checkin），记录有氧运动 + 力量训练 + 饮水 + 英语单词学习，带会员/教练双角色。

- **主体**：个人主体（未认证）→ 微信 OCR 云调用等需要认证的能力**永久不可用**，代码里已整体关掉（`runtime.js` 的 `ocrEnabled:false`）。
- **后端**：微信云开发。云函数 `somactiveApi`（线上唯一入口），环境 `cloud1-d5gz0w43l36c376a3`。
- **AppID**：`wx6b81913a5a90b3e0`
- **当前状态**：已上云、可上传体验版。最近上传 **0.2.22**（开发版，需在小程序后台手动选为体验版）。

**产品调性（最高优先级，改动前必读）**
不做"逼人自律"的工具：想记就记；断更回来不报"你断了 N 天"；少用"还差 / 连续 / 坚持 / 达成率"，多做"回顾 / 变化 / 陪伴"。
**社交功能已整体下线**（圈子、排行榜页面与开关均已删除），对外只有首页分享卡；打卡保存后不自动弹分享层。不要"顺手恢复"这些东西。

---

## 2. 30 秒跑起来

需要 Node ≥ 22.13 与微信开发者工具（已登录本项目管理员）。

```bash
npm install                 # 只有 3 个 devDependency，可不装也能跑（纯 Node 服务零运行依赖）
npm start                   # 本机后端 127.0.0.1:8787，数据存 .local/demo.sqlite
npm test                    # 全量测试
```

微信开发者工具导入**本目录**（读 `project.config.json`，`miniprogramRoot: miniprogram/`），编译即可。
真机预览见 `docs/MOBILE-TRIAL.md`（云开发路线，不依赖电脑）。

---

## 3. 目录地图

```
miniprogram/          小程序前端（主包，2MB 上限）
  pages/              18 个已注册页面（列表见 app.json）
  components/         dock(自定义底栏) rings ring-editor chart-heat pixel-face goal-set ...
  utils/              tokens(配色唯一来源) api cycles arcs srs wordlink sports speech canvas-export
  data/               pixel-avatars / cats / audio-manifest / words.js + words/（词库，见 §5.8）
  config/runtime.js   ★ 唯一运行时开关：cloudEnv / cloudFunction / apiBase / ocrEnabled
server/               服务端逻辑，跑在本机 8787
  http.js             ★ 本地 HTTP 入口 + 路由表
  mobile-gateway.js   ★ 云端入口（云函数调它），路由必须与 http.js 成对
  goals.js            ★ 目标口径唯一来源
  habits.js           ★ sportOf() 运动判定唯一来源
  domain.js learning.js coach-*.js wechat-identity.js ocr*.js
cloudfunctions/       云函数包（somactiveApi 由 build:cloud 生成，别手改）
scripts/              upload / build-cloud / cloud-deploy / preflight / shots / build-audio ...
tests/                55 个测试文件，node --test
docs/                 架构、验收、发布、真机等文档（见 §7）
prototypes/ outputs/  历史设计稿与截图产物（可删，不参与构建）
.local/               本地 SQLite 与音频暂存（不入包，删了自动重建）
```

---

## 4. 常用命令

| 目的 | 命令 |
|---|---|
| 起本机后端 | `npm start`（或 `npm run start:lan` 监听 0.0.0.0 供手机同 Wi-Fi 直连） |
| 跑测试 | `npm test` |
| 上传开发版 | `npm run upload -- 0.2.23 "一句话说明"`（会先跑 preflight，任一红灯中止） |
| 重建云函数包 | `npm run build:cloud`（改了 `server/` 共享模块后**必须**跑） |
| 部署云函数 | `npm run cloud:deploy`（内部会先 build:cloud） |
| 切换云环境 | `npm run cloud:env <环境ID>` |
| 真机截图 | `npm run shots -- 页面名片段`（需开发者工具自动化端口 9420 + 后端 8787） |

**上传 ≠ 上线**：`npm run upload` 只推开发版，必须去 mp.weixin.qq.com → 版本管理 → 开发版本，手动把该版本**选为体验版**，手机才能看到。

**部署鉴权**：`cloud:deploy` 走微信开发者工具 CLI，不需要腾讯云密钥，但**必须本机开发者工具已登录本项目管理员**。
唯一需要环境变量的是音频批量上传：`TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`（`scripts/upload-audio-cloud.js`，一次性任务，日常不用）。
仓库内**没有任何硬编码密钥**。

---

## 5. 硬约束（这些是踩过坑换来的，违反会静默出事）

1. **记录 ≠ 达标**：没达标也正常保存。「仅记录」不算成功也不算失败，休息日不扣分，隐藏 ≠ 删数据。
2. **目标口径只有 `server/goals.js`**：cardio 周分钟 / strength 周天数 / water 日 ml 幂等累加 / english 日词 / 自建 ×daily|weekly。首次显式设置立即生效，之后下周期生效，改目标**不追溯**。
3. **运动判定只有 `sportOf(c)`（`server/habits.js`）**：热力图、强度饼、教练乐高柱都从这取数。不许各处各算一套。
4. **有氧"运动日"判定只有 `utils/sports.js` 的 `qualifies(a)`**：低强度（散步）无门槛；中高强度只要 `durationSec>0` 即算有效运动日；距离只用于算配速、可选。
5. **教练只读**：教练端写接口全部 404；教练不能删会员数据；关联只由会员授权，任一方解除只断关系。
6. **本地与云端路由必须成对**：`server/http.js` 与 `server/mobile-gateway.js` 加路由要同时加。手机报"接口未开放"= 云端漏了。`tests/gateway-routes.test.js` 守着。
7. **样式只写设计变量** `var(--fs-* / --ink-* / --pad-*)`，不许裸数字；无 emoji；配色唯一来源 `miniprogram/utils/tokens.js`。
8. **主包 2MB 红线**（现状 ~1.03MB）。`data/words.js` + `data/words/` + `data/roots.js`（约 1.3MB 词库）被 `project.config.json` 的 `packOptions.ignore` **排除出主包**，词数据走云端接口。
   → **客户端可达代码绝不许 `require` 它们**（会让页面静默注册失败、整页空白），分类表只用 `data/cats.js`，`tests/bundle.test.js` 守着。
   → 新增 `data/words/*.js` **必须**同步加进 `scripts/build-cloud.js` 的硬编码清单，否则云函数 require 崩溃、全站接口失效。
9. **品牌改名只许动展示文案**：集合名 `somactive_trial_data`、云函数名 `somactiveApi`、客户端存储 key `somactive.*`、音频前缀 `somactive/audio` 全是内部标识，改了会**静默丢数据**（曾把集合名改成 `Somarise_trial_data`，重部署后读出"新成员 + 记录全空"）。`tests/brand-identity.test.js` 守着。手机端报"数据全没了"先查集合名。
10. **canvas 是原生层，不要用来做布局内图表**（高度一变就飘）；饼图用 CSS conic-gradient。
11. **WXML 不能写 `a<b`**；`wx:if` 里 `tip==='x'` 形式的面板才被 `tests/tips.test.js` 认。
12. **圆环位置定死**：`.ring-body` 必须 `justify-content:flex-start`，环装进固定宽 `.ring-slot`。**禁止 `justify-content:center`** —— 一居中，日/周切换时字长一变整组左右挪。`tests/rings.test.js` 守着。同理任何"指标/数字"都要落在固定宽度列里（如 `.sport-counter`）。
13. **说明弹层 info-pop 必须结构化**：拆成 `.ip-lead` 加粗导语 + `.ip-bul` 圆点条目 + `.ip-line` 补充行，**不许把一整段塞进一个字符串**（微信 `<view>` 不自动分段，会糊成一片）。`tests/infopop.test.js` 规定单行超 36 字直接红灯。

---

## 6. 当前状态与已知问题

- **测试基线**（两个数都对，取决于有没有音频素材）：
  - **本交接包（不含 `outputs/`）：397 / 399 通过**。
  - 原地完整目录（含 `outputs/audio-*`）：398 / 399 通过。
  - **真实缺陷只有 1 个**：`tests/domain.test.js` 的"monthly badge…every week closed"（`me.days` 期望 1 实际 0），属服务端月度奖章逻辑的**历史既有问题**，与近期改动无关，可单独跟进。
  - **另一个失败是缺素材，不是 bug**：`tests/audio.test.js` 的"例句朗读…"要求 `outputs/audio-words/`、`outputs/audio-sent/`（3084 + 9232 个 m4a，共 155MB）真实存在。这批音频是**托管产物、已上传到云端**（`AUDIO_BASE`，见 `miniprogram/config/audio.js`），不随源码包发。要补：从原目录拷这两个文件夹到 `outputs/` 下即可恢复 398/399。
- **README 过时**：仍写着"尚未部署"，实际已上云。以本文件为准。
- **待办**：真机视觉验收（学习范围浮层、60 个新词发音）；Somaxis 真实对接未接通（仅有授权接口）；教练端未来分列"记录 N 天 / 达标 N 天"。
- **已接入 git**：远端 `https://github.com/Somaxiseek/Somarise`（公开仓，main 分支）。本目录已 `git init` 并配好凭据，`git pull` / `git push` 可直接用；每次改动提交后再动手，改完先 `git diff` 自查。
- **死代码提示**：`miniprogram/pages/eat/` 存在但**未注册进 app.json、全项目零引用**，是历史遗留，不是现存功能，别误当成"饮食页坏了"。清理与否由接手方决定。

---

## 7. 先读哪几份文档

| 文件 | 内容 |
|---|---|
| `docs/ARCHITECTURE.md` | 分层与数据模型 |
| `docs/PUBLISH-GUIDE.md` | 发布/审核全流程（个人主体注意事项） |
| `docs/MOBILE-TRIAL.md` | 云开发环境开通与真机体验 |
| `docs/ACCEPTANCE.md` | 验收清单与历史踩坑记录（很长，按需查） |
| `docs/SOMAXIS-HANDOFF.md` | 外部平台对接现状 |

---

## 8. 建议的接手顺序

1. `npm install && npm test`，确认 397/399 基线（两个红灯的成因见 §6，都**不是本次交接新引入的**）。
2. `git pull` 确认与远端一致，之后**每次改动都先提交**（已接 GitHub：`Somaxiseek/Somarise`）。
3. `npm start`，开发者工具导入本目录，跑通首页。
4. 读 §5 硬约束，再动任何代码。
5. 改完按 §4 走：`npm test` → `npm run build:cloud`（若改了 server）→ `npm run cloud:deploy` → `npm run upload -- <新版本> "<说明>"`。

---

## 9. 交接包里有什么 / 没什么

**包含**：全部源码（miniprogram / server / cloudfunctions / scripts / tests）、文档、词库、20 张头像与音频清单、`project.config.json`。

**有意排除**（可重建 / 已上云，不必索取）：
- `node_modules/`（114MB，`npm install` 重建）
- `outputs/`（167MB 历史截图与原型产物）。其中 **`outputs/audio-words`（25MB / 3084 个）与 `outputs/audio-sent`（130MB / 9232 个）是音频录制素材**，已托管云端；只有需要重传音频或想让 `tests/audio.test.js` 全绿时才要单独拷这两个文件夹回来。
- `.local/`（本地 SQLite 演示库与音频暂存，首次 `npm start` 自动重建）
- `project.private.config.json`（本机 IDE 偏好，开发者工具自动生成）
