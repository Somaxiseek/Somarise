# OCR 与外部平台接入调查

调研日期：2026-10-25。仅查阅官方资料；没有创建应用、开通账户服务或提交审核。

## 截图识别

| 方案 | 适用性 | 成本与接入条件 |
|---|---|---|
| 腾讯云通用/高精度 OCR + 结构化解析 | 支持中文字行与坐标；还需针对不同运动App的布局、单位、日期解析，并经服务端校验 | 需实名认证账户、服务开通、服务端签名凭据；存在免费资源包、预付费及后付费。预算取决于接口版本、包量和是否重试，不能把免费额度当永久免费 |
| 自托管OCR（候选，未做引擎评测） | 可避免把图片送至外部供应商；需部署与维护，中文运动截图效果需样本验证 | 模型许可、硬件资源和运维成本待评估，不纳入本轮 |
| 通用视觉模型（候选，未选择供应商） | 可直接抽取结构化字段，但仍会误读或编造缺失字段 | API访问、按图片/令牌计费、地域及数据留存合同均需选型后核实；不据此声称已具备识别能力 |

腾讯云官方支持 ImageBase64（编码后≤10MB）或 ImageUrl；本MVP限制原图2MB、内存传递，不建云存储桶。本地 MockOCR 完全忽略图片语义，返回标注固定演示样例。不能用该样例评估准确率。

生产适配器契约：`recognize(bytes,{signal}) -> draft`，draft含运动类型、发生时间、时区、米/秒及选填指标、warnings；缺失必填项必须留空要求人工补全，禁止默认变成确认活动。指标重算后交给用户；`confirmed:true` 才可保存。错误类型应区分取消、超时、缺字段、单位不明、识别失败。

目前服务器只在请求内持有图片Buffer，finally清零；数据库只保留结构化活动和图片指纹，日志不输出图片/密钥。微信选择器产生的本机临时图片由微信管理，没有拷贝到业务长期目录。用户取消会忽略迟到结果；服务端最长5秒结束识别。真实适配器须支持AbortSignal。

若改为云存储临时文件，必须额外实现独立临时桶、短TTL、finally删除、持久化失败重试队列与定时过期清扫；当前没有该云端实现，也没有把模拟cleanup测试视为已完成云清理。供应商原始图片/结果留存政策与训练使用政策在已阅读API/计费页面中未得到充分确认，**接真实服务前必须核查合同和控制台设置**。不自动开启后付费。

来源：[腾讯云通用印刷体接口](https://cloud.tencent.com/document/product/866/33526)、[购买与后付费方式](https://cloud.tencent.cn/document/product/866/30575)。计费页本次未稳定读取到完整单价表，故不填写未经证实的具体报价。

## 运动平台

| 平台 | 接入与限制 | 本轮结果 |
|---|---|---|
| Strava | OAuth2及应用审核、用户规模/请求限额；新应用权限受限。2026协议限制某用户API数据向其他用户展示，不能直接用于小组动态/排行 | 只预留导入标准化边界，真实接入前需确认产品用途获准；不购买订阅或申请应用 |
| Apple 健康 | HealthKit 是 iPhone/Apple Watch 的原生健康数据仓库，需逐项用户授权；微信小程序没有直接调用HealthKit的原生能力 | 未来需原生伴随App/获准桥接或用户主动导出；不能用微信步数API替代跑骑游记录 |
| Garmin | Connect API云到云；官方概览列出Personal / Starter Business / Enterprise层级，容量、历史与交付方式因层级不同；FAQ与概览存在更新差异 | 必须以实际开发者门户审批和合同为准，不承诺即时可接入、历史回填或免费所有指标 |
| 华为 Health Kit | 经应用与用户授权，在获批数据类型和scope交集内读取；支持多种客户端/服务模式 | 需独立应用权限、服务端OAuth与区域核验；不是小程序可直接读取的系统数据库 |

统一导入结构：provider、externalId、type、occurredAt（含偏移）、timeZone、distance+unit（m/km/mi）、durationSec、heartRate/cadence/stroke、用户确认与可见范围。`server/import-contract.js` 仅模拟授权范围校验和标准化，未实现真实平台token存储/刷新、Webhook验签或撤销通知。接入时应扩展来源策略，例如 Strava 来源强制私密，不得因本地开关绕过平台条款。

来源：[Strava入门](https://developers.strava.com/docs/getting-started/)、[请求限制](https://developers.strava.com/docs/rate-limits/)、[Strava API协议](https://www.strava.com/legal/api)、[Apple HealthKit](https://developer.apple.com/documentation/healthkit)、[Garmin概览](https://developer.garmin.com/gc-developer-program/overview/)、[Garmin FAQ](https://developer.garmin.com/gc-developer-program/program-faq/)、[华为Health Kit](https://developer.huawei.com/consumer/en/hms/huaweihealth?ha_source=hms1)、[授权scope说明](https://developer.huawei.com/consumer/en/doc/HMS-Plugin-Guides-V1/signing-in-and-pplying-for-permissions-0000001074001642-V1)。

微信登录官方入口：[小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)。本次网页读取失败，正式接线前需在开发者工具和官方文档中再次核验当前要求。
