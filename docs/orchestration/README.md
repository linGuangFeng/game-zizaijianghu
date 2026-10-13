# 可见角色聊天与 Grok 执行

更新：2026-10-12（Australia/Perth）。真实聊天ID与任务登记见 registry.json。

## 已配置

- 所有角色聊天均通过当前 Codex 安装包的官方 MCP create_thread 创建，目标为 game-zizaijianghu 本地项目。
- Codex聊天负责调用、核查与汇报；实际指定任务由本机 Grok CLI 执行，不将Codex模型冒充Grok。
- grok models 已验证grok.com登录；可用grok-4.7、grok-4.7-build-fast、grok-4.6、grok-4.5。本轮指定grok-4.7；fast标记不等于更高质量版本。
- Grok需求与视觉、服务端与架构、独立测试各有独立聊天与输出文件；不同时改共享文件，主会话统一提交。
- 专门监听聊天已创建；heartbeat grok-5 已ACTIVE，每5小时检查。已通过automation_update view在应用渲染卡片。
- 已成功向监听聊天发送一次任务登记通知。执行聊天被要求在Grok完成、失败、需用户处理或关键阻塞时立即通知监听，不等下一次定时检查。
- 当前角色是首轮基线审查与方案交付，游戏内未知行为不得凭空实现。后续可在同一角色聊天持续分派已核实模块。

## 监听行为

2026-10-13 修正：此前监听仅覆盖 Grok 聊天，Codex 子代理结束和浏览器 ACL 错误仅送达主会话邮箱，主会话结束后未及时转交，造成无人接续。现将主会话及本地 execution-state.json 纳入 grok-5 的监听范围，保留每5小时巡检；非用户暂停的异常、所有执行者结束但项目未完成均视为可行动事件，向总负责人发送一次接续请求并核实运行。主会话负责转交子代理完成/失败事件，不能假设子代理消息会自动送达独立监听聊天。本轮真实事件已发送，监听已回复收到。

这不是进程级即时故障探针：主会话与执行者都无法发信时，需后续定时检查补获；不能承诺任何退出都立即通知。未收到恢复执行证据时，不得将派发成功记录为工作已恢复。用户暂停、真实外部阻塞和审批拒绝按各自原因处理，禁止绕过。

当前三个 Grok 调用均被各聊天的自动审批拦截，尚未启动 Grok。需求和架构角色已向监听聊天报告；QA 的即时通知也被审批拦截，其阻塞记录可由监听读取状态文件发现。主会话已向用户询问具体资料外发授权，未绕过拒绝执行。调度已配置不等于模型任务已运行。

每5小时读取真实聊天状态、Grok状态JSON及产物，重要变化才通知；无变化不刷状态消息。提前完成和异常由运行中的执行聊天发消息触发。若执行聊天或客户端异常退出，无法保证立即发出通知，由下一次可执行的定时检查发现；机器/应用运行条件按客户端实际调度能力，不宣称离线永久运行。

状态 JSON 应记录实际模型、Grok会话ID、开始/结束时间、运行/完成/失败、退出码、产物与通知结果。没有Grok调用证据不能标记为已由Grok完成。CLI调用结束不代表游戏功能通过，仍须独立接口与页面验收。

## 官方工具连接

scripts/app-mcp-client.mjs 使用当前官方codex-app-tools标准stdio MCP，继承真实环境，不修改应用数据库或构造私有IPC。请求与原始工具响应位于.gitignore排除的.local/orchestration；不提交账号凭据或含令牌URL。脚本不替用户答复审批，遇交互要求或权限失败应如实报告。

旧缓存codex-app-tools 0.1.3可以列工具，但调用当前应用返回Invalid app tool request；改用当前安装包0.1.5转发器后list_projects/create_thread/automation_update/send_message_to_thread/wait_threads均已成功。未修改原装插件代码或安全设置。

## 文件所有权

| 角色 | 独占交付文件 |
| --- | --- |
| 总负责人 | registry.json、本说明、总计划与任务板、scripts/app-mcp-client.mjs |
| 监听 | monitor.md、listener-state.json |
| Grok需求与视觉 | ../grok/requirements-review.md、../grok/requirements-status.json |
| Grok服务端与架构 | ../grok/server-review.md、../grok/server-status.json |
| Grok独立测试 | ../grok/qa-review.md、../grok/qa-status.json |

上述目录均相对本文件所在的 docs/orchestration。
