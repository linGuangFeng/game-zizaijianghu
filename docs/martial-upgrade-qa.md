# 上勾拳一次升级独立 QA

2026-10-13，Australia/Perth。本地Codex独立HTTP验收，非Grok输出；没有操作浏览器、修改实现或提交Git。

## 范围与原版依据

依据[event6-evidence.md](event6-evidence.md)的升级前后及材料提示：原版实际上勾拳1→2级，属性20/10/1000→40/20/2000，材料栏2/1→1/1；Lv2材料提示名称上勾拳、数量1、来源藏经阁。未观察升3级、抽取前同材料数量或重复转换过程。

本轮既有martial档兼容revision与可选uppercutProgress，不增加检查点、不默认发材料。全部正材料测试使用人工隔离fixture，不能归为自然获取。GET缺revision投影0，缺材料投影null，读取不迁移。POST /api/martial-state/upgrade正文为skillId上勾拳ID与expectedRevision；同队列一次扣1、升2、revision加1，任务不变。

GET及成功写state新增growth.uppercut，含等级、当前展示属性、材料名称/数量和targetLevel2/cost1/supported。owned上勾拳等级同步。属性只是已确认界面值，不是战斗公式；图鉴不因玩家升级自动改成Lv2。

## 独立HTTP结果

实际运行 `node .local/independent-qa/martial-upgrade-suite/http.mjs`，完整10/10 PASS。报告 `.local/independent-qa/martial-upgrade-aPcCGS/result.json` 包含时间、代码/脚本SHA-256、并发响应状态及重启PID。全部请求经过随机端口真实服务，只使用专用隔离角色与martial文件；测试进程已停止。

| 编号 | 实际内容 | 状态 |
| --- | --- | --- |
| MUQ-01 | 普通角色无martial档：读取/升级404，不隐式建档 | PASS |
| MUQ-02 | 旧twoEquipped bool档无revision/成长：GET投影Lv1/未知材料/rev0；升级未知拒绝；字节和mtime不变 | PASS |
| MUQ-03 | 有成长但缺材料仍未知；显式0材料不足拒绝，均不改状态 | PASS |
| MUQ-04 | 人工Lv1材料2/rev4：写失败全部不变，恢复后同rev两个升级恰一200一409，最终Lv2材料1/rev5/任务不变 | PASS |
| MUQ-05 | Lv2旧版本优先409 martial_revision_conflict；当前版本409 martial_upgrade_not_observed，不写 | PASS |
| MUQ-06 | 指定卸下、手动装回、另一槽卸下、一键装配，成长与材料全保留；实际变化递增revision，无变化字节/mtime不变 | PASS |
| MUQ-07 | 真实PID67284结束→新PID68844，不用初始化flag，Lv2材料1/rev9恢复 | PASS |
| MUQ-08 | 非法技能ID/结构/版本/额外字段400，方法405、媒体415、坏JSON400，存档不写 | PASS |
| MUQ-09 | 角色更名后GET/升级均409绑定不符，martial不重置 | PASS |
| MUQ-10 | 单武学checkpoint人工材料1，升级与旧空正文auto并发均成功，Lv2材料0/rev2；随后卸下为rev3且完成旗标保留 | PASS |
| MUQ-UI | 主会话真实内部浏览器未知材料、升级、停服重读、版本冲突及刷新 | PASS（仅文末已执行范围） |

首次运行在测试脚本重复停止已退出子进程时出现unsettled top-level await，未产出完整报告，不能计首次运行通过。已修复脚本stop对signalCode的判断，在新隔离目录完整重跑得到上述10项结果；未据此修改产品代码或归为产品缺陷。

## 事务与兼容边界

故障注入将专用martial文件改名备份，在原路径建立空目录阻止原子替换。升级返回500 local_operation_failed，内存完整状态、原备份字节、角色文件均保持；恢复后同revision并发重试仅一次成功。该场景不等于遍历全部磁盘故障或提交后网络丢响应。

双武学人工fixture继承旧twoEquipped格式，材料数量2与revision4由测试显式写入，不是生产赠送。读取和拒绝请求核对文件字节与mtime不变；写后装卸逐次核对growth、owned等级、材料、任务与revision。单武学fixture另行验证既有空正文装配/卸下接口兼容，以及共享队列不覆盖升级结果。本次单武学并发实际两个200；允许调度先装配造成旧版本冲突时由测试明确重读版本再试的分支，没有伪装原版时序规则。

最终精确拒绝：未知材料409 martial_material_unknown；0材料409 martial_material_insufficient；Lv2不支持继续409 martial_upgrade_not_observed；旧版本409 martial_revision_conflict优先于等级拒绝。非法请求400 invalid_martial_upgrade；无档404 martial_checkpoint_not_initialized；角色绑定409 martial_checkpoint_character_mismatch。

## 放行边界

明确一次升级的独立HTTP 10项与文末主会话真实页面路径通过，未发现本范围阻断，可记该局部双层验收PASS。正材料全部是人工隔离种子，不意味着普通角色拥有材料或已完成自然抽取→升级流程。

未涵盖重复武学转换、全背包库存、抽奖概率、任意等级升级、一键升级、升星、战斗数值公式、全部故障与视觉1:1。页面PASS仅依据文末主会话实际操作，不把客户端就绪通知视为测试结果。

## 主会话真实内部浏览器验收

本节实际操作由主会话执行于3010，专用目录.local/upgrade-browser。起始旧档从two-browser复制为人工隔离样本；本QA代理仅补录报告并核对下列5张截图存在，未操作浏览器。

1. 旧档首次进入上勾拳养成，材料显示unknown，升级按钮disabled。[未知材料](evidence/local-uppercut-material-unknown.jpg)。停止测试服务后手工设置uppercutProgress为level1、materialQuantity2。这是测试seed，不是自然发奖或生产默认材料。
2. 新进程打开后仍Lv1、材料2；停止服务后点击升级，提示结果未确认并锁定按钮。[停服失败](evidence/local-uppercut-upgrade-offline.jpg)。新进程启动后重新读取仍Lv1/材料2。此项仅模拟停服，不是已提交后丢响应。
3. 第二页编辑卸下槽2上勾拳，服务revision1；第一页详情仍revision0，点击升级发生冲突，仅重新读取，没有扣材料或自动重发。[旧版本冲突](evidence/local-uppercut-upgrade-conflict.jpg)。这是双页先后操作的版本冲突，实际HTTP并发另由MUQ-04验证。
4. 用户明确再次点击升级，成功Lv2、材料1，当前属性40/20/2000，升级按钮disabled并说明后续未开放。[升级成功](evidence/local-uppercut-upgrade-success.jpg)。未继续升3级。
5. 第二页一键装配后revision3，仍Lv2/材料1；返回养成和第一页刷新均保留。[刷新恢复](evidence/local-uppercut-upgrade-reloaded.jpg)。主会话核磁盘槽1入悟剑法、槽2上勾拳、revision3及uppercutProgress为level2/materialQuantity1，任务event1仍1/1，没有因升级推进或替换任务。

页面PASS范围限未知材料禁用、人工正材料一次升级、停服失败锁定与重读、装卸造成的旧版本冲突仅重读、再次明确升级、装配保成长和刷新持久化。页面未测已知0材料、提交后丢响应、延迟GET、自然材料获取或视觉1:1；已知0材料拒绝仅由独立HTTP用例证明，不冒称页面已覆盖。
