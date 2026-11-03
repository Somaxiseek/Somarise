# 已有后端复用检查

2026-10-27，只读源码检查；未访问会员数据库、云端账单或改变权限。

## 已确认

本地 coach-ledger/miniprogram/utils/cloud-sync-config.js 和 cloudfunctions/somaxisSync/index.js 均指向 Somaxis AppID wx0822840147bcd642、环境 cloud1-d4g07sgfr1e79dc19。已有 somaxisSync 与 somaxisGarmin 云函数。同步开关有独立控制；源码及文档记录存在时间差，不能仅凭本地配置推断当前线上启用状态。

网页端 docs/CLOUDFLARE.md 标明“部署准备（未执行部署）”，构建配置含占位绑定，独立认证网关尚有前置条件。因此没有证据将该代码当成可立即复用的已部署免费服务器。

官方账号FAQ确认同主体小程序可授权环境共享，包括云函数与数据库：https://cloud.tencent.cn/document/product/876/57380

## 结论

优先检查 Somaxis 现有云环境套餐及“环境共享”入口。可能省去第二套环境基础费用，但Somarise消耗仍计入资源方环境，不能承诺新增成本为零。现有套餐、剩余额度、共享资格及收费须控制台确认。

若适用，使用独立 somactiveApi 云函数与 Somarise_trial_data 集合；不得把 Somarise 数据并入现有会员集合，不修改原同步函数/开关，不向成员公开数据库。共享是环境层面的权限扩大，独立命名不等同强隔离；须核对平台共享范围与现有函数是否检查来源AppID。当前Somaxis函数有AppID校验设计，但实际部署版本未核实。

当前Somarise客户端只实现独立环境模式。共享环境需另加跨小程序资源初始化，并按可信来源上下文正确识别调用者（不可假定资源方APPID即调用方APPID），配合虚构双账号权限测试后才能部署。只填已有环境ID不能完成共享，也不能作为授权。

## 下一步所需只读信息

打开 Somaxis 项目的云开发控制台，查看当前套餐/资源用量与环境共享入口；截图隐去个人信息即可。不需要AppSecret，不读取数据库数据。若平台允许再提出具体共享授权；未获得该步骤确认前不改变共享权限或部署到Somaxis环境。
