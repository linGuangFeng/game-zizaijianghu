# 首次突破新领取入统一账本独立 QA

2026-10-13（Australia/Perth）。本地独立QA，非Grok。没有实现第二次突破或假定事件10/第三技能条件；此次仅既有首次突破迁入schema2后新领取的宝典令同步入账。未改产品或Git，页面由主会话执行。

真实HTTP/CLI独立 **9/9 PASS**。脚本 `.local/independent-qa/realm-reward-suite/http.mjs`；原始结果 `.local/independent-qa/realm-reward-2pfbmF/result.json`。五个后端文件执行前后SHA256完全一致。全部样本为独立人工fixture，非正常角色发奖。

| 编号 | 实际结果 | 状态 |
| --- | --- | --- |
| RRQ-01 | 原realm已有event5 receipt，迁入后token可用0/总量null；GET与当前版本重领不写；停服重复CLI不重复导入或补发 | PASS |
| RRQ-02 | 新martial2领取遇rename失败，receipt/资产/内存/备份均不变；恢复后同版本并发200/409，恰一条realm-reward:first-breakthrough-martial2、delta5、source first-breakthrough-claim，realm与asset revision各+1 | PASS |
| RRQ-03 | 当前版本重领无写、旧版本409；training30领取与commerce首日领取并发均200，token可用50（新两领10+首日40），三receipt及三商品流水保留 | PASS |
| RRQ-04 | 首次advance后训练一次，阅历120→104/气血2610；token仍50，消费与成长同主档，商品三流水保留；旧realm源侧档仍仅原一条receipt | PASS |
| RRQ-05 | 真实PID72248→71432重启后realm/assets/commerce完整恢复，当前版本重领无写/无再入账 | PASS |
| RRQ-06 | 旧侧档模式领取只写receipt、主角色原字节不变、assets404；随后显式迁入也不补旧奖励 | PASS |
| RRQ-07 | 人工构造已存在schema2旧receipt但无对应资产entry；GET及当前版本重放不补；后续新的training30才入账5 | PASS |
| RRQ-08 | 角色改名后领取绑定409，保持原有账本条目且无写 | PASS |
| RRQ-09 | 新receipt领取与武学升级并发均200，token+5、上勾材料1→0/Lv2，各自域保留，武学源侧档不写 | PASS |

本轮主会话 **RRQ-UI局部PASS**，具体范围见末节。接口没有给未知总余额赋精确值；available只累计本地已知来源。没有将原版当前41/46等余额导入，也没有把首次条件receipt改成第二次突破条件。历史receipt不追溯是明确兼容边界，不是漏发缺陷。

故障采用隔离目标文件位置临时变为空目录，恢复后继续；未测系统崩溃或提交成功后丢响应。跨域本轮实际并发分别覆盖commerce首日领取与武学升级，realm训练在领取后顺序执行；不冒称本轮覆盖所有跨域组合。最初8项报告仍保留于realm-reward-7fFZTn，补明确要求的武学域保留用例后完整重跑9项，最终结果以上述2pfbmF报告为准。
## 主会话内部浏览器局部验收

3018使用人工复制的未突破旧fixture，再显式迁入schema2；初始阅历120、条件未领取，不是自然开局或新授予的奖励。以下由主会话真实内部浏览器执行，本代理转录，不称自行操作。

- 两页同版本领取event5：一页成功获5，旧页同条件提交冲突后只读恢复；角色资产显示可用5与一条+5流水。
- 停服务会话60210后领取martial2：失败并锁写；重启会话12136重读，仍仅event5已领，无半笔奖励。
- 再正常领取martial2、training30：资产可用15、三条各5来源，阅历保持120；刷新→侠客仍15。
- 主会话读取主档：assets revision3、entries4（包括原阅历导入）、realm revision3、receipts3，与页面一致。

图证：[第一笔5](evidence/local-realm-reward5.jpg)、[停服失败](evidence/local-realm-reward-offline.jpg)、[15与刷新保持](evidence/local-realm-reward15-reloaded.jpg)。本轮独立最终报告为9/9，最初8项与最终9项原始报告都保留；主报告已核的5文件hash对应相同实现，独立记录自身前后hash也不变。

未在页面验证历史receipt不补发、与commerce或武学同刻并发，也未模拟提交成功后丢响应或延迟GET。以上没有因HTTP覆盖而提升为页面通过；停服失败与双页旧版本操作仅按实际范围局部双层PASS。
