# 首次突破检查点独立 QA

2026-10-13，Australia/Perth。本地 Codex 独立 HTTP 验收，非 Grok 输出；没有运行浏览器、改动实现或提交 Git。

## 证据与合同边界

依据 [事件5与首次突破证据](event5-equipment-evidence.md) 的首次突破章节以及架构最终契约。原版已观察事件5、武学2、训练30三条件分别领取宝典令5，随后初入江湖突破九品前期。没有独立令牌背包余额对比，因此 receipts 仅是本次领取流水，不是总余额，也不代表原版协议。

显式 REALM_CHECKPOINT=observed-before-first-breakthrough 才能在已有角色且没有境界档时初始化。共用 REALM_SAVE_FILE（默认角色路径加 .realm.json）；普通角色不自动解锁。初始三条件均达标但未领取，属性30/15/2000、领悟收益100、阅历120。三项各领取一次后允许突破，成功属性40/20/2500、领悟收益150、阅历仍120。本轮没有自然完成事件/武学/训练的跨模块推进。

GET /api/breakthrough-state；POST /api/breakthrough-state/claim 使用 conditionId 与 expectedRevision；POST /api/breakthrough-state/advance 使用 expectedRevision。当前版本重复动作不写，旧版本409 realm_revision_conflict，是本地并发与幂等约定，不是原版重复操作取证。

## 独立实测

运行 `node .local/independent-qa/breakthrough-suite/http.mjs`，实际10/10 PASS。原始报告 `.local/independent-qa/breakthrough-NZSjWA/result.json` 含 UTC 时间、完整关键响应、服务端与脚本 SHA-256、真实进程 PID。全部请求经过随机端口真实 Node HTTP 服务，仅专用隔离角色/存档；所有测试进程已结束。

| 编号 | 实际核验 | 状态 |
| --- | --- | --- |
| BQ-01 | 无角色读取404 character_not_found，不创建境界档 | PASS |
| BQ-02 | 普通已有角色GET/claim/advance均404 breakthrough_checkpoint_not_initialized，无隐式初始化 | PASS |
| BQ-03 | 显式初始精确schema；未领齐拒绝突破；新突破档旧境界GET/train均404 realm_training_checkpoint_unavailable，不写档 | PASS |
| BQ-04 | 领取落盘失败无receipt/版本/属性部分生效；恢复后同版本同条件并发恰一200一409 | PASS |
| BQ-05 | 当前版本重复领取不写，旧版本拒绝；1项、2项领取时均不可突破；三项领取产生唯一流水各5 | PASS |
| BQ-06 | 突破落盘失败保持全部状态；恢复后并发突破恰一200一409；成功属性/收益准确，重复突破/领取不写 | PASS |
| BQ-07 | PID67200结束后新PID66928、不带初始化flag启动，三流水、revision4和九品前期完整恢复 | PASS |
| BQ-08 | 非法条件/结构/版本/额外字段400，媒体415、坏JSON400、错误方法405，状态不写 | PASS |
| BQ-09 | 角色更名后GET/claim/advance均409 realm_checkpoint_character_mismatch，不重置境界 | PASS |
| BQ-10 | 人工旧训练档带新flag启动仍旧档；GET不写迁移，突破接口均404；旧训练仍成功并正确扣12 | PASS |
| BQ-UI | 主会话内部浏览器普通角色入口、领取、突破、停服恢复、双页版本冲突与刷新 | PASS（仅文末实际路径，视觉非1:1） |

失败注入只将专用境界文件暂移备份，在原文件路径建空目录使原子替换失败，HTTP返回500 local_operation_failed。两类失败均核对内存完整状态、原备份字节和角色文件不变；恢复后原版本可再次提交。未遍历全部磁盘故障类型。

重复动作同时核对存档字节与mtime不变。领取并发使用同条件/同revision的两个真实HTTP请求；突破并发同理，不以顺序请求冒充并发。状态逐字段检查包含资源120、条件达标文本、每张claimed、唯一receipt、canAdvance、advanced、属性和收益。

旧训练兼容测试使用人工合法fixture：revision3、阅历84、次数1/1/1、属性12/6/1100；明确不是自然获取过程。新突破flag没有覆盖它，读取与拒绝请求未改变字节或mtime，后续试招仍按原训练合同扣为72。没有自动把旧训练档升级成突破档。

## 放行边界

明确首次突破检查点的独立HTTP 10项与文末主会话真实内部浏览器路径通过，未发现该范围阻断，可将本检查点已执行的双层验收记为PASS。页面由主会话执行，本QA代理仅补录报告并核对4张截图文件存在；不扩大为完整自然流程或视觉1:1通过。

普通角色自然开局/事件5/训练30/装配条件联动尚未闭环；原版新服L21因Unity HTTPS到不安全WebSocket错误阻塞，未成功创建新角色。本轮不据此虚构正常新角状态或默认奖励。

未覆盖下一次突破、九品后续训练、总令牌余额、主线任务奖励、原版重登协议、提交后丢响应、延迟GET以及视觉/动画1:1。原版突破条件领取与主线事件任务领取是不同动作，不能混称任务链完成。

## 主会话真实内部浏览器验收

以下操作由主会话在3009隔离服务实际执行，本QA代理未操作浏览器。页面结果与上述独立HTTP验收分别归属。

1. 普通角色创建后无突破入口；停止服务，显式flag初始化后显示三条件、属性30/15/2000及领悟收益100，尚无突破按钮。[初始状态](evidence/local-breakthrough-initial.jpg)。
2. 领取event5，实际显示“恭喜获得”宝典令5。停止已知服务后领取martial2，没有假成功，全部动作锁定并显示重新读取按钮。[停服失败](evidence/local-breakthrough-offline.jpg)。真正新进程不带flag恢复，重读仅event5已领。本项是停服失败，不是提交已成功后丢响应。
3. 两页同读revision1，主页领取martial2成功；另一页旧版本提交冲突，自动只读恢复，没有奖励弹层，也不自动重发领取。[版本冲突](evidence/local-breakthrough-conflict.jpg)。另一页明确领取training30后才出现突破按钮。
4. 两页读revision3，另一页先突破成功，属性40/20/2500、领悟收益150；主页随后以旧版本突破返回409，自动读回advanced，不产生新写入。这是双页顺序操作产生的旧版本冲突；真实HTTP并发已由BQ-04/BQ-06另行核验。
5. 刷新保留最终状态。[突破结果](evidence/local-breakthrough-result.jpg)。主会话同时核磁盘revision4、三条唯一receipt各5、experience120。receipt仅为本次流水，不当作令牌总余额。

四张关联截图均已核文件存在。页面PASS只覆盖普通角色无入口、显式检查点展示、逐项领取与按钮解锁、停服后锁定/重读、新进程恢复、领取及突破旧版本冲突只读恢复、刷新持久化。未测提交后网络丢响应、延迟GET、全部竞态、视觉/动画1:1或正常角色自然达到此检查点。
