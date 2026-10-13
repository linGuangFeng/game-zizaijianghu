# 测试购买与首日领取独立 QA

2026-10-13（Australia/Perth）。本地Codex独立QA，非Grok输出。仅QA脚本/文档，不改实现或监听文件，不付款、不运行浏览器、不Git。

## 合同与范围

GET /api/test-commerce展示CNY600（即¥6）荡剑式三天商品；POST /purchase使用productId/requestId，测试模式直接paid；POST /claim-day1使用orderId/expectedRevision，独立领取产生荡剑式1、宝典令40、元宝60的三条流水。流水不是总余额、可用武学、实际装备或充值渠道到账。后两日、复购和跨日领取未实现。

订单与领取存入角色单文件外壳schemaVersion1，旧纯角色GET只读不迁移；角色GET外部shape保持。PUT角色需保留commerce，改名后绑定冲突而不重置订单。没有新checkpoint或commerce sidecar，martial/realm/gear不得被购买或领取改变。

## 独立实际执行

已运行.local/independent-qa/commerce-suite/http.mjs，随机端口真实HTTP 10/10 PASS；主会话页面在文末限定范围PASS。

| 编号 | 验收范围 | 状态 |
| --- | --- | --- |
| TCQ-01 | 无角色GET/购买/领取404且不建文件 | PASS |
| TCQ-02 | 旧纯角色GET不迁移，未购买不得领取 | PASS |
| TCQ-03 | 购买写失败不半写，恢复成功paid及单文件外壳 | PASS |
| TCQ-04 | 同/不同requestId重放购买返回原单，不增版本不重复 | PASS |
| TCQ-05 | 领取写失败不半奖；并发同版本只一份三流水 | PASS |
| TCQ-06 | 当前版本重复领取不写，旧版本与错单拒绝 | PASS |
| TCQ-07 | 真正新进程重启保持paid及三流水 | PASS |
| TCQ-08 | 非法商品/请求ID/版本/正文/媒体/方法拒绝 | PASS |
| TCQ-09 | PUT同角色或更名保留commerce，更名后绑定拒绝且不重置 | PASS |
| TCQ-10 | 首次购买并发不同requestId及角色PUT，只一订单不丢数据 | PASS |
| TCQ-UI | 主会话内部浏览器购买、独立领取、停服恢复、旧版本冲突与刷新 | PASS（仅文末范围） |

所有测试仅人工隔离角色与既有侧文件fixture，非原版账号或自然流程；已逐状态核对原侧文件字节不变。商品证据见event8-payment-evidence.md，本地协议为实现合同，不冒称原版支付协议。

## 原始结果与放行边界

报告.local/independent-qa/breakthrough-QiuXtI/result.json记录10项PASS、执行时间、store/app/index与脚本SHA-256。复用辅助函数遗留breakthrough目录前缀，实际为独立TCQ测试，未覆盖已有报告。所有子进程已停止。

首次订单38f4fcfa-dbf1-4c31-99af-eed1027183bc在购买后paid/revision1，尚未领取且grants空。购买和claim分别用隔离角色文件目标空目录制造原子替换失败，HTTP500且内存、备份和三个其他sidecar不变，恢复后原操作成功。两条同版本claim并发恰一200、一409，最终revision2且仅三条唯一首日流水。

同requestId与不同requestId重复购买均返回原单；当前版本重复领取不写，文件字节/mtime不变，旧版本和错误订单分别拒绝。真实PID15420结束→PID65744启动，订单及流水恢复。旧纯角色GET不迁移；同角色PUT与改名PUT均保留commerce，改名后读取/购买/领取绑定拒绝而不清空订单。独立重置本测试角色后的首次购买并发两个requestId与PUT仍仅一订单，证明共享队列未丢订单。

合法武学、境界、装备fixture在各步骤逐字节保持；没有把权益注入这些系统或生产余额。测试paid仅本地模式，不接支付渠道。独立接口及文末主会话页面局部双层通过，但不能标完整REQ-004通过；后两日、复购、多商品、余额/技能可用性、真实支付和丢响应时序未覆盖。

## 主会话真实内部浏览器验收

本节由主会话在3012实际操作，本QA代理仅补录执行报告并核对6张截图文件存在。使用无任何checkpoint的普通已有角色；本地测试模式不扣真实款，不连接可消费钱包。

1. 资料→本地测试充值，显示¥6.00及荡剑式1、宝典令40、元宝60三项，明确无真实扣款、未接钱包。[初态](evidence/local-commerce-before.jpg)。
2. 停服务后点购买，失败不报成功，禁购买而保留重读；[购买停服失败](evidence/local-commerce-offline-purchase.jpg)。新进程重读尚未购买，主会话再次明确点击后得到paid，未自动领取。[已支付待领取](evidence/local-commerce-paid.jpg)。
3. 另一tab读取相同paid/revision1。停止服务后主tab领取失败，禁用写入，保持paid且无grants；[领取停服失败](evidence/local-commerce-offline-claim.jpg)。新进程主tab重新读取仍revision1。
4. 另一tab领取成功产生三条流水；主旧tab再领取发生冲突，只重读、不重复领取。[领取冲突](evidence/local-commerce-claim-conflict.jpg)。这是顺序双页旧版本场景，页面未测试同刻并发；并发一次发放另由TCQ-05真实HTTP验证。
5. 刷新及资料页往返，保持相同三条已领取流水，按钮禁用。[刷新恢复](evidence/local-commerce-reloaded.jpg)。主会话核角色主文件commerce revision2、order paid、day1Claimed true、grants恰3，角色身份保留。

两种停服测试均不代表“写入已提交后响应丢失”。页面未测提交后丢响应、延迟GET、同刻并发、后两日或消费使用。首日流水不是已可装备的荡剑式，也不是可消费宝典令/元宝钱包余额；没有把它们注入武学或其他系统。

本轮允许局部测试购买直接paid→独立首日领取流程记双层PASS。REQ-004整体仍未完成，完整充值权益可用性、其他商品和后续领取规则待实现/验收；项目整体未完成。没有真实付款或原版订单操作。
