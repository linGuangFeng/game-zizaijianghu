# 双技能指定卸下独立 QA

2026-10-13，Australia/Perth。本地 Codex QA实际执行，不是Grok输出。未操作浏览器、未改主聊天存档、未提交。

## 事实依据

已读 `event1-evidence.md`，逐图查看 `original-two-remove-slot1.jpg`、`original-two-remove-slot2.jpg`、`original-two-empty.jpg`、`original-two-empty-reverse.jpg`。前两图显示清目标槽、不前移另一技能，以及只上勾装配时列表上勾→入悟、只入悟装配时入悟→上勾。两张全空图均为入悟→上勾。连续卸下实际先后及初始上勾槽1卸下结果另依据主聊天最新操作报告；不以静态图推导操作历史。

读取证据文档时仍有“连续卸下未知”的旧表述；本轮采用主聊天已明确更新的取证与新增全空图片。任务事件1/1保持依据主聊天报告和当前合同，非这些武学截图直接显示。手动装配、更多技能与通用排序不由本轮扩展。

## 实际接口合同

POST /api/martial-state/unequip-slot，JSON严格为 `{position:1}` 或 `{position:2}`。成功200返回state；只对双技能检查点开放，单技能新路径409 martial_action_not_observed。旧空正文unequip保留。新sidecar保存twoSlots与ownedOrder；旧twoEquipped布尔档兼容读取，GET不落盘迁移。

本地请求格式/拒绝行为、幂等和持久化均为本地契约，不声称原版重复点击或重登规则。

## 独立HTTP结果

命令 `node test/qa/martial-two-remove.mjs`，实际执行10/10 PASS。测试启动真实 `server/index.js` 进程并经HTTP验证，不调用开发测试函数。

| 编号 | 已执行验证 | 状态 |
| --- | --- | --- |
| TR-01 | 未开启检查点普通角色404且不建sidecar、不改原角色 | PASS |
| TR-02 | 初始上勾槽1卸空后owned入悟→上勾；一键恢复入悟1/上勾2 | PASS |
| TR-03 | 已装双项按1→2卸下，中间上勾保持槽2，owned上勾→入悟；全空入悟→上勾；一键恢复 | PASS |
| TR-04 | 已装双项按2→1卸下，中间入悟保持槽1；全空入悟→上勾；一键恢复 | PASS |
| TR-05 | 专用sidecar目标替换失败500，内存/备份/角色不变；恢复后重试成功 | PASS |
| TR-06 | 真正新进程重启保留空槽1/上勾槽2与owned上勾→入悟、任务事件1/1 | PASS |
| TR-07 | 空槽重复请求本地不写；非法JSON/媒体/字段/类型/槽0/3/4/6/额外字段及错误方法均拒绝，文件与状态不变 | PASS |
| TR-08 | 显式测试更名后409绑定不匹配，不覆盖sidecar或更名角色 | PASS |
| TR-09 | 预置旧twoEquipped=false与true两档，分别GET映射正确且字节不变；真实卸下后写明确slots/order | PASS |
| TR-10 | 单技能新路径409不变档；旧unequip仍可成功且任务保持1 | PASS |
| TR-UI | 主聊天内部浏览器编辑、点击指定红叉、刷新及失败提示 | PASS（主会话执行） |

所有双技能状态断言均核对六槽锁状态、owned等级与顺序、任务event1-reference/通关江湖事件1/1/1，并验证原角色文件字节未变。TR-08中姓名变化是显式测试请求，不是卸下副作用。

## 可复核证据与限制

原始报告 `.local/independent-qa/two-remove-le2MsN/result.json`，保留完整响应、错误、实际执行时间及服务/测试SHA-256。真实重启PID15496→52604；所有测试服务均已结束。数据与原始备份位于该专用目录，没有接触主浏览器数据。

故障通过在本次测试目录中保存sidecar备份、以空目录占目标实现；失败时GET仍为两项装配，恢复备份后实际重试卸下槽1。这不代表覆盖所有磁盘/断电错误。TR-07包含12种错误请求，但未独立验证本路径超16KiB限制或全部方法组合。

本轮未发现确定范围内阻断问题。页面由主会话随后执行，见下节；接口通过不能替代1:1视觉验收。更多技能、拖动排序、手动装配及原版重登不在本轮通过范围。

## 主会话页面实际验收

使用3003既有双技能true布尔存档重启新版本，内部浏览器刷新→武学→编辑，两个红叉正确显示“卸下入悟剑法”和“卸下上勾拳”；启动与页面GET后sidecar SHA-256仍为6EF7772976BE70B398429BE7FD3A97EE6D5F67515AFF3901EFFB9E7B3FAA56E4，未做读取迁移。

停止本测试服务，实际点击卸下入悟剑法，显示卸下失败且原双槽、徽标、任务保留。恢复服务在原页面重试，槽1空、上勾拳仍在槽2，列表上勾→入悟。继续点击卸下上勾拳，全空且列表入悟→上勾；一键装配恢复后单独卸下上勾拳，入悟保持槽1、槽2空。

sidecar实际变为twoSlots=[ruwu-sword-reference,null]和ownedOrder=[ruwu-sword-reference,uppercut-reference]。再次停止并启动新服务进程，刷新→武学仍是入悟槽1/槽2空、事件任务1/1。截图local-two-remove-failed.jpg、local-two-slot1-removed.jpg、local-two-empty.jpg、local-two-slot2-removed.jpg位于evidence/。本段归属主会话点击，QA代理未代操作；美术与完整游戏仍未通过1:1验收。
