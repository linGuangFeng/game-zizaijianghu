# 单技能装配检查点独立 QA

2026-10-13，Australia/Perth。本地 Codex QA，不是 Grok 输出；不操作浏览器、不提交。本报告只验收明确开发检查点，不将其称作普通角色初始状态或全量武学系统。

## 原版证据边界

本代理已逐图查看 `original-martial-task-before-equip.jpg`、`original-martial-equipped.jpg`、`original-martial-task-after-equip.jpg`，结合 `martial-evidence.md` 与主聊天操作报告核对：唯一已拥有的上勾拳 1 级，一键装配后槽 1 出现拳形图标且卡片显示已装配，槽 2、3 保持加号，4～6 保持锁。任务由装配武学 0/1 变为 1/1；任务文字有引导/光效遮挡，进度判断同时依据主聊天实际观察，不虚称截图完整无遮挡。主聊天报告退出再回武学保持结果。

尚未验证原版重复点击、多技能排序、手动装配、升级、卸下、奖励、资源消耗和装配后重登。下面的本地幂等及重启测试只验证自定义契约，不证明这些原版规则。

## 执行用例

| 编号 | 范围 | 状态 |
| --- | --- | --- |
| ME-01 | 未开启检查点的普通角色不被赋予上勾拳、装配任务或开放槽位，调用不创建sidecar | PASS |
| ME-02 | 显式检查点在已有旧格式角色存档旁初始化，角色原始字节保持不变 | PASS |
| ME-03 | 检查点初始状态与已观察单技能装配前状态一致 | PASS |
| ME-04 | 真实POST一键装配迁移为槽1上勾拳、卡片已装配、任务1/1，其他槽不变 | PASS |
| ME-05 | 已装配状态真实新进程重启后保留，原角色存档不变 | PASS |
| ME-06 | 在测试专用sidecar制造写入失败，不能假成功或修改原角色；解除故障后可重试 | PASS |
| ME-07 | 本地契约若承诺重复请求稳定，则重复POST不产生额外状态迁移；仅标本地保障 | PASS |
| ME-08 | 非空正文400、错误方法405，均不改sidecar及原角色 | PASS |
| ME-09 | 角色绑定变更后409，不自动重置或覆盖sidecar | PASS |
| ME-UI-01 | 主聊天内部浏览器实际点击、任务及槽位结果与API一致；刷新读取保持 | PASS（主会话执行） |

实际接口 GET /api/martial-state 与 POST /api/martial-state/auto-equip；响应 state 标注 local-martial-checkpoint 与 observed-before-equip，包含 owned、slots、task。默认 sidecar 为角色文件路径追加 .martial.json，可显式覆盖；检查点仅在启动前已有角色且开启 MARTIAL_CHECKPOINT=observed-before-equip 时初始化。独立测试使用随机端口、专用目录及自己创建的子进程，不改已有角色或浏览器测试存档。

## 验收声明约束

接口结果与页面结果分开归属，页面未执行不能冒充双层验收。通过仅支持该显式检查点；普通角色缺少原版已获技能来源不阻塞检查点测试，也不能静默给普通角色发放技能。每项实测保留命令、时间、代码摘要、请求响应、角色文件前后字节及sidecar结果。

## 新增卸下取证与范围

主聊天后续报告：编辑→槽 1 红叉成功卸下，槽 1 为空、卡片已装配消失；退出后任务仍为 1/1。证据路径 `evidence/original-martial-edit.jpg`、`evidence/original-martial-unequipped.jpg`、`evidence/original-martial-task-after-unequip.jpg`。本条为主聊天执行报告，本代理尚未逐图复核该批次，不将其写作本代理浏览器操作。

因此任务完成应为持久完成状态，不能根据当前槽是否非空实时推导。本轮不要求实现卸下，未提供卸下接口不作为本轮失败；完整范围中仍需补充编辑/卸下实现及双层测试，后续验证卸下不重置已完成任务。原版装配后重登仍待取证。

## 本地独立接口实测

执行 `node test/qa/martial-equip.mjs`，退出码 0，9/9 PASS。脚本独立启动真实服务、经 HTTP 验证，不调用开发测试。报告 `.local/independent-qa/equip-9uU23z/result.json` 保存实际时间、文件摘要、响应及迁移结果；实例随机端口与专用目录，全部已停止，未触碰浏览器测试角色。

- 未开启检查点的已有普通角色，GET 和 POST 均 404 martial_checkpoint_not_initialized，无 sidecar，原角色字节不变。
- 显式开启后，旧 name/appearanceId 格式文件保持原字节，sidecar 初始化 equipped=false、taskComplete=false；只在明确检查点出现上勾拳和槽位。
- GET 初态与证据对应；真实 POST 后槽 1 为 uppercut-reference、2/3 空、4～6 锁，任务 1/1。属性与伤害算法不在此接口。
- 在本次测试目录保留 sidecar 备份、以空目录占据目标模拟落盘替换失败，返回 500 local_operation_failed；内存仍未装配、任务0/1，备份及原角色不变。恢复目标后重试成功。
- 真实终止 PID 2780，再启 PID 64224（不重新设置检查点变量），已保存的装配及任务仍存在，原角色字节不变。这是本地持久化保证，不是原版重登证据。
- 重复 POST 两次，sidecar 字节及角色不变。只说明本地幂等处理，不据此断言原版重复点击行为。
- 非空正文得到 400，错误方法得到 405，均不改存档。
- 最后一项通过角色 API 有意更改本测试角色姓名，随后武学 GET/POST 都为 409 martial_checkpoint_character_mismatch，sidecar 和已更名角色均不被这些失败请求重置。此处角色变化是明确测试步骤，不是武学接口副作用。

存储实现分别维护 equipped 与 taskComplete；本次只验证装配置两个旗标并持久化。卸下后 equipped=false、taskComplete=true 的真实接口链路尚未实现/执行，不标通过。无角色显式初始化失败、损坏 sidecar 启动及所有文件系统故障类型也不在这 9 项覆盖中。

本轮未发现阻止明确检查点接口交付的问题。本轮通过不代表完整装配系统、编辑卸下或游戏 1:1 完成。

## 主会话页面实测：2026-10-13

内部浏览器访问独立端口3002，使用 `.local/equip-browser-61c0b2d80814457f93040a3b5216bfa4/character.json` 与显式装配前检查点。真实点击“武学”时槽1～3空、4～6锁、任务0/1；点击“一键装配”后槽1上勾拳、卡片已装配、任务1/1。独立GET与sidecar中的equipped/taskComplete两个字段均对应成功状态。截图：`evidence/local-martial-equipped.jpg`。

点击返回角色后任务1/1，刷新再进入武学仍保持。主会话终止该实例，在页面再次点击装配，显示“装配失败，请重试”，已确认的槽位和任务未被清空；重启新进程且不传初始化变量，原页面重试成功，刷新仍为装配任务1/1。这是本地失败提示与重启恢复测试，不证明原版幂等或重登规则。执行人是主会话，区别于上述独立QA接口执行。
