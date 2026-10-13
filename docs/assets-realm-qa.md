# Schema2资产与境界统一事务独立 QA

2026-10-13（Australia/Perth）。本地Codex独立QA，非Grok输出。仅独立脚本与报告；没有改server/client、监听文件，没有操作浏览器或提交Git。

## 实际执行

已读最终server/assets.js、store.js、migrate-assets.js契约并独立运行 `.local/independent-qa/assets-realm-suite/http.mjs`。全部10项真实HTTP/CLI验收PASS，原始报告 `.local/independent-qa/assets-realm-XyRr48/result.json`。

所有存档为本脚本隔离人工数据，服务使用随机端口；每次CLI前明确停止对应子服务。实际命令为 `node server/migrate-assets.js --character FILE [--realm FILE]`，没有迁移主会话或用户原始存档。报告保存运行时间与store/assets/realm-store/migrate-assets/app五个实现文件前后SHA-256，codeChanged=false，无测试期间实现变动需要重跑。

## 验收结果

| 编号 | 实际验证 | 状态 |
| --- | --- | --- |
| ARQ-01 | 旧纯角色GET角色相关状态/旧realm不迁移；assets404，不改主文件或侧档 | PASS |
| ARQ-02 | 显式CLI迁realm，schema2与源SHA-256准确；同源重复CLI字节/mtime不变，旧侧档保留 | PASS |
| ARQ-03 | schema2购买后首日claim失败无半领取/半账；同版本并发一200一409，3权益流水只记2类资产；重复无写 | PASS |
| ARQ-04 | 初入江湖训练失败余额/成长/流水全部保持；同版本并发一200一409，120→108、攻击10→12、唯一-12条目 | PASS |
| ARQ-05 | 训练与角色PUT、重复购买同队列并发全部200，余额96且原领取不丢，侧档不变 | PASS |
| ARQ-06 | 真实重启，迁入后把专用侧档改为非JSON仍能启动及训练到84，侧档不读不写 | PASS |
| ARQ-07 | 侧档合法内容改变造成hash不同，CLI拒绝且主文件不写；恢复原字节重跑无重复导入 | PASS |
| ARQ-08 | PUT更名保留assets/domains；assets与realm绑定错误拒绝；更名状态CLI拒绝且不重置 | PASS |
| ARQ-09 | 旧模式训练仍写侧档/commerce仍schema1；绑定不符迁移拒绝；仅资产迁移既有grants各一次，追加realm拒绝，旧侧档模式仍能训练 | PASS |
| ARQ-10 | 九品advanced人工旧档迁入后并发训练仅一次成功，120→104、气血2610、三receipts不变且不导入其宝典令 | PASS |
| ARQ-UI | 主会话内部浏览器资产与境界交互 | NOT_RUN（待主会话实际结果） |

## 迁移与原子证据

首次realm源摘要为 `9308f7c97abfdbe92c257269bced4ec0c5848c227aa2c070be73f1c40a1b6ab5`，与原始文件字节独立计算一致。主文件domains.realm起始与源对象一致，保留realm原revision。重复同源迁移核主文件字节及mtime无变化。改变源余额后CLI非0且提示source differs，未覆盖主数据；恢复源字节后无重复导入，也没有用源旧余额覆盖主文件已消费后的84。

领取与训练各一次故障均将自己的主文件改名备份并在原路径建立空目录，阻止原子替换。两次HTTP500时分别逐字段核assets、realm、commerce内存状态与备份字节保持，恢复后重试才能提交。训练条目精确 `{id:'realm-training:1',assetId:'jianghu-experience',delta:-12,source:'realm-training'}`，资源与成长同步，不是事后异步补流水。

实际结束PID67900并新启PID30168。重启前专用realm源改成非JSON，服务仍从已迁主域恢复96及旧订单/账本，继续训练到84，源文件内容保持原故障字符串。随后停止服务并恢复源备份，只用于后续CLI hash测试。这项直接证明已迁主realm不依赖启动时读取或写回该侧档；没有触碰其他真实存档。

## 资产语义与兼容边界

首日claim后宝典令available40、元宝available60，而两者total均null；代表本地已记录可用批次，不虚构历史总余额。迁入realm才有江湖阅历账户，total和available随已知源余额及训练扣款一致。荡剑式仍仅commerce的一条权益流水，assets无其账户，普通测试角色武学接口仍404，没有变成可用武学。

已领取schema1订单在显式无realm迁移时导入两类资产条目各一次，同CLI重放不增；无经验账户，旧realm侧档仍按旧路径训练。之后试图追加--realm被明确拒绝，不宣称支持在线或增量迁域。武学/装备未纳入统一域，突破条件receipts本轮不转资产。

所有初始角色、旧realm、余额120、订单及九品advanced状态均为隔离fixture，不代表自然开局或资源奖励；没有把原版1.92万转换成精确导入值，也没有实现挂机公式。

## 放行边界

独立接口与离线CLI合同范围通过，未发现阻断；所有独立QA测试子服务已停止，已向主会话及架构报告。后续主会话页面结果见下节。未测试真实提交后丢响应、延迟GET、所有文件故障、在线迁移、来源文件竞争修改时序、多域追加或完整钱包消费/自然获取。角色更名绑定拒绝并保留数据是当前本地合同，不冒称原版行为。

## 主会话内部浏览器验收

主会话在3013隔离服务测试。将此前本地突破验收的角色与已advanced、阅历120的realm复制至`.local/assets-browser/`，对该未运行的新副本执行显式CLI迁移，然后启动服务；没有修改原版或把人工检查点当作自然开局。迁移源digest为`8c45028ae1f1e0fb479c390055abc1edaa5ca3d5d8a5ebdbe6f41fb25244abcf`。

| 操作 | 实际结果 | 证据 |
| --- | --- | --- |
| 侠客→资料 | 阅历120；宝典令、元宝总量未知且可用新增量0 | [初始](evidence/local-assets-before.jpg)与DOM |
| 本地测试充值→购买→领取 | 订单paid，首日三条权益；资产新增宝典令40、元宝60，total仍未知；阅历120 | [领取后](evidence/local-assets-claimed.jpg)与DOM |
| 境界突破→继续修炼→练武 | 阅历120→104，进度0→1/39，攻击40→42；资料同步一条阅历-16流水 | [资产扣费](evidence/local-assets-spent.jpg)与DOM |
| 第二页面仍旧版本点击聚气 | 提示记录已更新，读取104及1/39；聚气保持0，没有第二次扣款 | [冲突](evidence/local-assets-training-conflict.jpg)与DOM |
| 停止3013，页面读取资产及另一页训练 | 资产旧数值清空并显示重读按钮；训练提示结果待确认，按钮锁定，没有假成功 | [停服](evidence/local-assets-offline.jpg)与DOM |
| 新进程启动同主档，点击重读资产/修炼 | 恢复40/60/104与1/39，未重放失败的聚气；重读订单恢复已领取 | 主会话操作记录与DOM |
| 刷新→侠客 | 40/60/104及四条资产变动保留 | [刷新](evidence/local-assets-reloaded.jpg)与DOM |

主会话随后核对主文件：assets revision2、四条entries，realm revision5、experience104、trial1/stance0/run0，commerce revision2及三grants；保存状态与上述页面相符。又逐一核对独立报告的五个实现文件SHA-256，全部匹配。

本轮局部功能接口与页面点击双层PASS（ARQ-UI PASS）。长页面截图可能只显示视口内部分，完整数值以当次DOM与文件核对记录为补充。页面仍是简化本地样式，不能将本轮功能验收称为原版1:1视觉或完整游戏验收通过；无元宝/宝典令消费入口，武学/装备与突破票据也未统一。
