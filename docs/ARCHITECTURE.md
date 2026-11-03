# 架构与检查报告

## 检查证据与结论

检查时间：2026-10-25。只读访问 GitHub 源码，没有读取业务数据库或云端运行状态。

| 检查对象 | 已观察证据 | 结论 |
|---|---|---|
| Somaxiseek/lianji-coach-workspace | main 树 SHA `4b430ba243eb026c3311a9a122bbeb5ecdeb6604`；README、app/model.ts、app/api/state/route.ts、docs/DEVELOPMENT.md、docs/CLOUDFLARE.md | Web/TypeScript、vinext/Cloudflare 架构，非现成原生小程序骨架 |
| 现有云配置 | 文档与状态接口使用 D1 DB / R2 BUCKET，coach_state 按 owner 隔离，revision 乐观锁 | 借鉴隔离和版本冲突原则，不复制云绑定或认证头，不复用正式云环境 |
| 会员模型 | Member.id + name，训练 Session.memberId；整套 coach state 按 owner 存储 | 没有足够证据证明现有结构支持跨小程序身份；新建显式映射，不用昵称匹配 |
| 同步风险 | PUT 整套状态 + revision，生产身份依赖可信登录网关；普通 Worker 不自动具备网关认证 | 不能把客户端提供的 owner/openid 当可信身份；整体状态写入会扩大数据影响面 |
| coach-ledger/miniprogram | 按 GitHub owner/repo 请求返回404；已检查工作台主分支树未见 miniprogram 目录 | 可能是本地路径、其他分支或未授权仓库，无法检查该代码；不能声称已验证其微信云开发配置 |
| 本项目 sources/ | 当前为空 | 没有额外同步文档可检查；没有改动任何 sources 文件 |

参考：[工作台仓库](https://github.com/Somaxiseek/lianji-coach-workspace)、[交接文档](https://github.com/Somaxiseek/lianji-coach-workspace/blob/main/docs/DEVELOPMENT.md)、[状态接口](https://github.com/Somaxiseek/lianji-coach-workspace/blob/main/app/api/state/route.ts)。未确认线上同步是否完整或是否存在未提交代码，不推断云端状态。

## 隔离方案

新增 `aerobic-checkin/`；没有克隆、提交或推送到原仓库，没有修改工作台、会员数据、云函数或远程权限。独立本机 SQLite，独立用户与运动 ID。未来宜单独仓库管理，不将正式 env ID、成员备份、网关头或凭据复制进来。

微信页面 → 本机 Bearer session → HTTP 白名单路由 → Service 统一校验和权限 → SQLite 单行 JSON 快照。单进程同步变更并原子写入；此简单存储不用于生产多实例。服务端从令牌取得 userId，忽略提交的 userId/id/createdAt 等保留字段；编辑检查 revision。读写路由分别限定 HTTP 方法，不接受跨源浏览器请求。

正式用户链路预留：wx.login code → 服务端微信 jscode2session → `(appId,openid)` 唯一身份映射 → 内部 UUID + 短期服务令牌。session_key 仅服务端使用，不返给客户端。unionid 仅在满足微信条件时作为经过核验的关联线索，不假定其一定存在。

## 逻辑集合与字段

| 集合 | 主键及核心字段 |
|---|---|
| users | id；nickname、avatar（本地占位）、timeZone、createdAt；正式扩展 `(appId,openid)` 唯一映射 |
| activities | UUID、userId、type、occurredAt UTC、timeZone、distanceM 整数米、durationSec 整数秒、heartRate、cadence、stroke、source、externalId、confirmed、visibility、createdAt、updatedAt、revision、fingerprint、imageHash、requestId |
| activity_sources | id、kind；manual / ocr_mock / import_mock，未来扩展 provider 与授权引用 |
| groups | UUID、name、ownerId（创建者元数据）、invite、timeZone、createdAt |
| group_members | UUID、userId、groupId、createdAt；逻辑唯一 `(userId,groupId)` |
| user_group_permissions | `(userId,groupId)`、share 布尔，默认 false；退出立即删除，重加入不恢复授权 |
| somaxis_account_links | UUID、userId、memberId、coachId、scope=stats:read、consentedAt、createdAt；仅允许虚构绑定码 |

组创建者退出后小组保留，MVP 无管理/解散特权。邀请码为随机16位，知码可加入；生产需过期/轮换及反滥用。真实部署应拆为独立表并为幂等键、指纹、外部活动ID、身份与绑定建立数据库唯一索引。

## 规则与权限

- `server/domain.js` 的 RULES 为门槛/异常上限唯一配置。上限为MVP可调整产品保护，不是医疗判断。
- km输入要求10米倍数，泳距为整数米；速度和配速只从距离/时长计算，不信任截图给出的指标。
- 运动日期与创建时间分开；按当前所选统计时区重新分桶。修改个人时区会改变日历与连续记录，小组时区创建时固定。
- 单条达门槛才有有效日，同日小段不合并凑门槛。连续天数锚定今天，有效今天尚未产生时允许从昨天向前计算；更早中断则为0。
- 最近28天为今天及前27天；月榜按每次请求时小组自然月重新计算，不需要午夜写库重置。并列采用1、1、3竞赛名次。
- 自己可读写自己的记录；组员才能看组信息；只有主动同意分享的用户上榜，动态再要求逐条 groups 可见，返回卡片省略心率等选填敏感数据。榜单的分享开关明确覆盖全部有效运动天数，含私密记录贡献的汇总天数。
- 幂等 requestId 在响应丢失后重试返回原记录；相同运动（用户、类型、时间、距离、时长）、图片字节SHA256、同来源外部ID重复拒绝。不同裁剪/时间轻微变化的截图不能保证完全识重，但一天仍最多一个有效日；不误合并真实的多次运动。

## Somaxis 最小权限契约

原始运动只保存在本工具；Somaxis 未来用其可信教练身份及稳定 memberId 读取汇总，不复制整套运动。Service.coachStats 的测试返回最近28天有效日、打卡率、当前连续天数、最近运动日期及三种运动的28天记录次数。现已开放角色隔离的本机教练只读汇总路由；成员不能读取教练接口，教练不能写运动。仅使用虚构会话，不代表正式认证。分类汇总增加总米数和总秒数。

正式绑定方案：双方身份验证后签发短效一次性绑定凭证（audience、nonce、memberId、coachId、expiry），用户明确授权 stats:read；后端消费凭证并建立唯一映射。解除即时撤销读取，缓存必须失效。禁止直接接受客户端填写真实 memberId，禁止使用不同小程序 openid 相等的假设。

## 停留在待授权/待配置边界的事项

1. 取得 `coach-ledger/miniprogram` 的正确只读路径/仓库权限，补完架构核查。
2. 提供独立测试小程序及测试认证配置后，接线并验证真实微信身份；密钥只能服务端管理。
3. 任何正式云开发权限、数据库、云同步、Somaxis身份签发、生产部署变更均未执行。
4. OCR开通、自动后付费、任何服务采购、外部平台授权/审核均未执行。

没有调用正式数据库、迁移、同步、购买或部署操作，也没有需要用户批准但被悄悄跳过的远程写操作。

## 当前配色

以用户提供的青绿色参考图为准，替代之前的森林绿配色：主青绿 #237f7e、深青绿 #1e6263、浅灰白背景 #f4f7f7、白卡片、正文 #264b4b、辅助文字 #5b7072、边框 #d8e2e3、浅青绿强调 #dcefee。首页顶部为青绿渐变白字，统计数字、按钮和授权开关使用主青绿，打卡日期使用浅青绿。

## FastLog 参考布局

依照用户提供的六张界面参考实现大圆角白卡、胶囊筛选、右侧圆形数字、28天格点轨迹、独立统计视图及底部新增入口。保留青绿色品牌配色。运动卡片数字为本月该运动有效天数，不能点击即增加打卡；点击只打开已选类型的录入表。未照搬通用习惯的任意计数、桌面组件或归档功能。

月历从周一开始；边框圆圈代表有效打卡日，角标表示全部运动记录次数。统计率明确标注最近28天，避免误当选中月份的完成率。

已从用户提供的本地 coach-ledger/miniprogram/utils/reflections.js 只读复制语录库。保留文本、作者、类型与来源信息，首页首次加载随机不重复抽取；译文和练习灵感分别标注，缓存键使用 Somarise 命名空间。原 Somaxis 文件未修改。

## 心肺训练层级

首页一级分类为“心肺训练”，默认折叠；展开后显示跑步、骑行、游泳、爬坡、其他心肺训练，各自保留记录和有效天数。父级按有效自然日并集计算，同一天做多个项目仍计1天。

前后端共用 miniprogram/utils/sports.js。原三类距离门槛保留；爬坡与其他心肺训练暂设单次20分钟有效，距离选填（0表示未记录距离），产品规则可调整。时长类型显示分钟，不计算配速。Somaxis分类汇总包括新类型；旧记录无需迁移。

## 当前视觉方向：黑白灰

用户最新要求优先：使用浅灰背景 #f5f5f5、白卡片、黑色主按钮与打卡标记 #111111、正文 #171717、辅助文字 #737373。去除青绿色与渐变，保留极简卡片和心肺层级。

## 最新首页与自定义目标

首页改为仅展示会员拥有的类别和项目，语录不显示来源及提示；截图入口移至新增菜单，具体历史移至项目详情。categories/projects/checkins及周、年、连续目标在可信服务端计算。成就由记录重算，不可客户端提交发奖。详情见 HABITS-AND-NUTRITION.md。原有心肺统计继续独立，个人任意习惯不自动向教练公开。
