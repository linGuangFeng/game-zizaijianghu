# 武学客户端未知结果恢复与图鉴专项 QA

2026-10-14（Australia/Perth）。本地QA独立审查并实际复跑架构编写的专项测试；不是另一套独立编写用例，不是Grok，也不是内部浏览器页面验收。仅QA报告和状态文档修改，未改产品或Git。

## 实际执行

最终class样式版执行 `node --test test/server/martial-client-recovery.test.js`，12 tests / 12 pass / 0 fail，退出0，耗时5437.6418ms。摘要与代码SHA256见 `.local/independent-qa/client-recovery-result.json`，执行前摘要见 `client-recovery-before.json`；client/app.js、client/styles.css、专项测试文件前后hash一致。未重复后端96项旧范围。

## 独立代码审查

- 三种武学写入入口均检查正在写入或状态尚未确认，提交前使martialGrowthReady=false；完整成功响应投影后才恢复。未知结果维持旧槽展示并禁用装配/编辑/卡片/红叉/养成升级，提供现有GET重读；没有自动重发POST。
- 图鉴请求序号在fetch返回、JSON返回及catch分别校验；离开列表令旧请求失效，避免旧结果重复追加或覆盖新成功状态。
- 锁槽4/5/6按钮只显示已观察的通关12/19/32关提示，不触发写接口。样式已按项目约定slot-lock-hint类移至styles.css，没有内联style。
- 测试实际运行当前client/app.js、读取当前HTML并使用真实createApp HTTP服务及隔离存档；在真实POST返回200且读取提交结果后注入丢响应或JSON失败，随后检查磁盘revision/槽状态。不是仅伪造服务端成功。

未发现阻碍本次脚本范围放行的实现问题。此前临时inline样式与最小DOM替身不兼容属于开发过程，最终版复跑未出现该失败，不将其列为最终产品缺陷。

## 12项覆盖

| 组别 | 实际断言 | 数量 |
| --- | --- | --- |
| 三槽写未知结果 | auto中空补满丢响应、卸下中槽JSON失败、入悟补回丢响应；服务端与磁盘已提交revision1，显示保持旧状态且所有写锁定，不自动重发；GET再失败仍锁，成功GET恢复真实槽和动作 | 3 |
| 旧模式回归 | 单武学auto丢响应、单武学卸下JSON失败、两武学手动补位丢响应，同样确认写锁和GET恢复、不重复提交 | 3 |
| 图鉴乱序 | fetch和JSON两个阶段各旧成功/旧失败，共4项；新请求先成功，旧回包不追加重复卡、不覆盖成功状态 | 4 |
| 离开图鉴 | 离开列表后延迟JSON返回不重绘旧列表，仍处角色页 | 1 |
| 锁槽提示 | 点击4/5/6分别显示12/19/32关解锁条件，HTTP请求数和存档均不变 | 1 |

## 限制与页面状态

**MCR-UI NOT_RUN**。当前内部Browser技能未列、旧绑定失效；没有用宿主浏览器替代。此测试使用最小DOM替身，没有CSS布局渲染、真实浏览器事件/焦点/网络栈或视觉验证；12项PASS仅为客户端逻辑与真实HTTP回归，不给三槽页面或全游戏双层PASS。

未知结果样本涵盖“服务已提交后客户端未得到可信响应”，区别于此前仅停服。注入仍为测试传输包装器，不声称真实网络链路已完成同样实验。没有本轮新增提交前网络失败场景、任意损坏state结构、全部并发组合或完整刷新导航覆盖。

内部浏览器恢复后仍需真实点击三槽编辑中槽卸下/补回、失败后的锁定与重读、锁槽提示和图鉴往返；新模拟测试不撤销用户接口+页面双重验收标准。

## 最终文件SHA256

- D:\work\hd\game-zizaijianghu\client\app.js: `9B2C17F2BCB6AAD97324910C6DADDE2973B2FA7533F4BE76ACFD7D5C0254DA24`
- D:\work\hd\game-zizaijianghu\client\styles.css: `D93CD3D85D01E755098F573B5429025957841518573080016D82920B345E1DF5`
- D:\work\hd\game-zizaijianghu\test\server\martial-client-recovery.test.js: `A063EDB0C77BB880C51E1076AEF60C630857034A90223A7D3E1376D6AFF81668`
