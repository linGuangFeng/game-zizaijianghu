# 装备域统一存档独立QA

## 结果与范围

GU-01至GU-09：9/9 PASS，实际独立Node子进程HTTP与离线CLI执行。仅显式人工隔离存档迁移，无真实角色导入、无资源授予。UI NOT_RUN：当前内置Browser未列，未使用宿主浏览器。本报告不把接口测试记作页面或完整自然链通过。

脚本：`.local/independent-qa/gear-unified-http.mjs`。原始报告：`.local/independent-qa/gear-unified-2ur1nQ/result.json`。执行时间2026-10-14T03:40:31Z，exit0；所有CLI在对应自有服务停止后运行，测试结束自有进程已停止。

|编号|实际检查|结果|
|---|---|---|
|GU-01|普通角色gear404，GET主文件字节不变|PASS|
|GU-02|旧侧档GET不迁移；旧模式穿戴只写侧档、主角色不变|PASS|
|GU-03|先旧--realm命令迁入，再同次追加gear/martial；保当前金刀rev8与上勾材料2；摘要匹配原字节，重复gear迁入无写|PASS|
|GU-04|迁后GET及已穿同版本no-op字节不变；两个同版本切紫只200/409，assets完整不变|PASS|
|GU-05|主文件路径临时目录阻止rename；HTTP500，四域GET与备份原字节不变，恢复后可继续|PASS|
|GU-06|装备切金、训练扣12、上勾升级扣1材料、测试购买四并发均200；gearrev10、武学Lv2、训练rev1、阅历108、材料1和paid单均保留；三源侧档不变|PASS|
|GU-07|实际进程31584停→55292启动；刻意破坏已弃用gear源，五域仍从主档恢复一致；CLI坏源拒绝不写，恢复原源同hash重跑不覆盖已消费域|PASS|
|GU-08|同次martial+gear迁入遇gear绑定不符全拒，主字节不变；修正人工源后一次迁入两域成功|PASS|
|GU-09|PUT改角色名保留域，gear GET/写均409，失败主字节不变|PASS|

断言依据是人工样本的既有合同，未从原版推断装备数值算法。未测页面和真实断网响应；不重复宣称其他历史API全覆盖。

## 测试源码SHA256

执行前后完全一致，原始报告保留两份值。

|文件|SHA256|
|---|---|
|server/store.js|85a749461dbf5460ea90eeac69d26a54ac4c58dcf9d6573880fbc24059bde732|
|server/app.js|4ba3a6aa489bfbb4066bceef08b9f219c2ddb5595378e459b63fccee898a9645|
|server/index.js|a1d46832636a2011dbb4f5175e95180f0b41b97317c670443b3bd4e21dcc1587|
|server/migrate-assets.js|47b35fe7610f99df8dab027501b08f0546c06a84c0f90d8d5b3ace894f4aee7e|
|server/gear-store.js|81e415d86eace16d97e0ee41b900056d10fc88f5f425bcd95cb75912f05c450c|
