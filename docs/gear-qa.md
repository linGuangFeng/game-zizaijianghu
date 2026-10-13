# 血战刀装备检查点独立 QA

2026-10-13，Australia/Perth。本地 Codex QA，非Grok输出；仅gear专用本地测试目录及本文，不改实现、不浏览器、不Git。

## 已确认合同

正式名称为“血战刀”，主聊天已撤回此前“刃”的误读；本地ID仍为 bloodwar-blade-purple、bloodwar-blade-gold，不能由ID反推中文名。

显式 GEAR_CHECKPOINT=observed-event5-blade 初始穿金色。紫色展示60/30/2980/5、power1679；金色96/48/4760/5、power2793。装备总展示紫600/300/2.98万/50，金636/318/3.15万/50。气血万值保留 healthText，不推算精确整数或战力公式。

GET /api/gear-state 与POST /equip、/auto-equip按架构schema；owned固定紫→金。单次手选紫/金，auto仅复现当前两项观察样本选择金，不推广通用最优装备规则。当前revision同已穿装备本地不写，旧revision即使已穿也409；这不是原版协议证据。

## 独立执行结果

| 编号 | 验收内容 | 状态 |
| --- | --- | --- |
| GQ-01 | 普通角色无gear档，GET/写入不隐式初始化；既有武学境界档不变 | PASS |
| GQ-02 | 显式初金、手动紫→金与精确展示文本、revision及角色文件 | PASS |
| GQ-03 | 当前版本同装备/auto无写，旧版本冲突不变 | PASS |
| GQ-04 | 写失败不改内存/备份/角色及其他档；恢复后同revision重试 | PASS |
| GQ-05 | 真正新进程重启保持装备与revision | PASS |
| GQ-06 | 同revision并发auto和手选金仅一次提交 | PASS |
| GQ-07 | 非法ID/结构/revision/媒体/JSON/方法拒绝且不写 | PASS |
| GQ-08 | 角色绑定不符GET/手选/auto均拒绝且所有档不被重置 | PASS |
| GQ-UI | 主会话真实内部浏览器选装与失败/重读/刷新 | PASS（仅文末已执行路径） |

脚本 `.local/independent-qa/gear-suite/http.mjs`；仅创建隔离角色与专用端口。为检查存档隔离，人工预置合法旧武学及境界fixture，不表示玩家正常获得或通过对应任务。页面结果必须另归属主会话，接口成功不能替代页面验收。

## 实际HTTP验收

已只读核对 gear-store、app路由及index启动参数，实际运行 `node .local/independent-qa/gear-suite/http.mjs`，8/8 PASS。报告 `.local/independent-qa/gear-jzdG6I/result.json` 包含完整展示响应、执行时间、代码/脚本SHA-256及重启PID。各请求经真实服务HTTP，未用开发测试结果代替。

- 普通角色无gear档，GET与手动请求404 gear_checkpoint_not_initialized，不创建存档。
- 显式初金revision0→手选紫revision1→手选金revision2，精确对照各自item属性、power及装备总展示。3.15万/2.98万按字符串核对，没有新增推算精确气血。
- revision2手选同金与auto均200但存档字节及revision不变；使用旧revision1即使仍选金也409 gear_revision_conflict。
- 专用gear目标以空目录制造写替换失败，选紫返回500；内存仍金/revision2、备份与原角色/既有武学/境界文件字节均不变。恢复备份后同revision2重试选紫成功为revision3。
- 真正停止PID68476并新启PID65816，不传GEAR_CHECKPOINT初始化变量，仍紫/revision3。
- 同revision3并发auto和手选金，恰好一个200、一个409冲突；最终金/revision4，只有一次提交。
- equip非法ID/结构/revision及auto非法字段分别400，错误媒体415、非法JSON400、错误方法405；gear档与其他状态不变。
- 显式测试更名后，GET/手选/auto均409 gear_checkpoint_character_mismatch，不重置gear或覆盖更名角色，旧武学/境界fixture字节仍未变化。

原角色及两个合法旧状态fixture均为本测试专用人工数据，不表示自然解锁、领取或取得装备。测试进程已结束；所有脚本与原始输出仅在授权的本地gear目录，不假称已提交仓库测试资产。

## 放行边界

未发现本轮两件血战刀检查点范围的阻断问题。独立HTTP8项及文末主会话真实页面路径通过；允许将当前明确检查点的局部双层验收记为PASS。页面由主会话执行，本QA代理仅按报告补录并核对8张截图文件存在，不冒称自己操作或首次选择器尝试成功。

不包括完整十槽装备、物品自然掉落/获取、数量、装备拆卸、通用品质或战力排序、属性公式、精确万值、强化分解、真实提交后丢响应、全部文件故障与原版重登。当前auto仅当前样本选金；本地revision和同装不写不代表已取得原版协议。

## 主会话真实内部浏览器验收

本节操作来自主会话实际报告，使用3008最新后端及隔离空目录。原版取证、本地人工检查点初始化与页面验收分开，不把金色装备归为普通角色默认奖励。

1. 内部浏览器创建女性角色“装备页面验收”→侠客，无装备入口，也无gear档。[普通角色](evidence/local-gear-ordinary.jpg)。停止服务后显式设置 GEAR_CHECKPOINT 初始化金色样本。
2. 进入装备详情，核金色血战刀power2793、属性96/48/4760/5，总展示636/318/3.15万/50。[金色](evidence/local-gear-gold.jpg)。
3. 点击“更换装备”选紫，详情power1679、60/30/2980/5，总展示600/300/2.98万/50。[紫色](evidence/local-gear-purple.jpg)。初次使用“更换”locator超时，随后按可见DOM实际名称“更换装备”纠正，这是测试选择器错误，不是产品更换失败；不把首次超时算通过。
4. 停止已知测试服务session后点一键穿戴，显示失败并保持紫色，写控件disabled、要求重读。[失败](evidence/local-gear-failure.jpg)。新进程不带初始化参数，重读仍紫，再次明确点击auto成功金色。[一键穿戴](evidence/local-gear-auto.jpg)。本操作仅模拟停服失败，不是写入已提交后丢响应。
5. 第二页面读取金色revision2；第一页面换紫成功revision3。第二页面以旧版本点auto，冲突后只重读紫色，不自动重发写入。[冲突](evidence/local-gear-conflict.jpg)。这是双页先后操作产生的旧版本冲突；HTTP并发的一次提交保证另由独立GQ-06证明。
6. 第二页面详情→更换装备→手选金色，成功revision4。[手选金色](evidence/local-gear-manual-gold.jpg)。刷新→侠客→装备，金色保留，磁盘revision4吻合。[刷新](evidence/local-gear-refresh.jpg)。

以上关联截图实际为8张，均已核文件存在。气血3.15万与2.98万始终只作为显示文字核对；没有把缩写推成精确总气血或属性计算公式。

页面放行仅涵盖普通角色无入口、明确样本的两品质详情/候选/手选/一键穿戴、停服后重读、顺序版本冲突不自动补写及刷新持久化。未测延迟GET、提交后网络丢响应、全部竞态、全视觉一致性或完整装备自然获取链，不宣称全覆盖或1:1装备系统完成。
