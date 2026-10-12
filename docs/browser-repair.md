# 内部浏览器恢复记录

日期：2026-10-12（Australia/Perth）。本记录依据主代理完成的操作与核验结果。

## 环境与原因

主会话权限环境从 `workspace-write` 变为 `danger-full-access` 后，exec/node 工具恢复正常。这是用户会话环境变化，不是代理修改或修复系统沙箱。

浏览器 bootstrap 随后发现当前运行时所需的 `browser/26.1002.52244/scripts/browser-service.mjs` 缺失，本机缓存当时只有 `26.825.51511` 版本。

## 修复与核验

已从当前安装包的官方原装目录：

`C:/Program Files/WindowsApps/OpenAI.Codex_26.1002.7124.0_x64__2p2nqsd0c76g0/app/resources/plugins/openai-bundled/plugins/browser`

复制同版本文件到：

`D:/data/codex/plugins/cache/openai-bundled/browser/26.1002.52244`

已核验 384 个文件的哈希一致；未覆盖旧版缓存，未修改插件代码。

重置控制会话后，已连接 `Codex In-app Browser`（`type=iab`，`id=2`），打开准确游戏入口、截图，并真实点击“用户登录”和“微信登录”。未使用宿主机浏览器。

## 当前状态

内部浏览器能力已恢复。游戏尚未登录，微信登录弹出同意服务条款与隐私政策的要求；主代理已向用户询问同意，尚未获取二维码。下一步等待用户同意及后续扫码，继续游戏内取证。

游戏实现、接口测试与本地游戏页面点击验收均尚未开始。上述原版入口点击仅证明浏览器可操作并记录登录流程，不构成本地游戏功能测试通过。