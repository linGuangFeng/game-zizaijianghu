# 三槽限定操作独立 QA

2026-10-14（Australia/Perth）。本地独立QA，非Grok。独立脚本与报告，不改产品或Git。原版证据见 `third-martial-evidence.md`；完整蓝色武学名称仍未知，blue-sword-reference只是本地参考标识。

## 实际接口结果

真实Node子进程/HTTP **10/10 PASS**。脚本 `.local/independent-qa/three-slot-suite/http.mjs`；原始结果及夹具 `.local/independent-qa/three-slot-789AZs/result.json`。五个后端文件执行前后SHA256相同，`codeChanged:false`，具体摘要见末节。

所有三槽数据均人工隔离样本：既有observed-event1-before-equip档显式含threeSlots，未添加checkpoint或自动授予蓝色武学。只支持[蓝色,入悟或null,上勾]两个状态；本地三本owned不是原版五张卡完整列表，不推广未实现的多空槽/拖动/满槽换卡/选优规则。

| 编号 | 实际测试结果 | 状态 |
| --- | --- | --- |
| T3Q-01 | 普通角色无域GET404，无主文件变化且未生成武学文件 | PASS |
| T3Q-02 | 旧格式无revision的三槽人工档GET投影0，无字节/mtime写入；mode/actions、六槽锁态、上勾Lv2/材料2、原event1任务不变 | PASS |
| T3Q-03 | 中槽卸下只空2、槽3上勾不前移；owned蓝/上勾/入悟；重复卸无写；入悟补回2后owned蓝/入悟/上勾，重复补回及满态auto无写 | PASS |
| T3Q-04 | 槽1卸409未观察、槽3卸原入口400、手动上勾409、蓝id400、旧整体unequip409；全部不写 | PASS |
| T3Q-05 | 侧档rename故障500不改内存/备份；恢复后双并发卸中槽均200但revision仅+1，补回与auto并发同样仅一次变更；原材料成长/角色不变 | PASS |
| T3Q-06 | 保留中空态真实重启PID66492→82036，仍中空/原成长材料，auto恢复满态 | PASS |
| T3Q-07 | 显式CLI --martial迁入schema2，GET零写；主文件rename失败无半态；卸中槽与测试购买并发均200，各域保留；装卸期间assets完全不变，源侧档字节不变；真实重启PID26560→77640恢复中空及paid单，补回后仍材料2 | PASS |
| T3Q-08 | 改名保留原domains，绑定不符卸下/auto均409且不写 | PASS |
| T3Q-09 | 旧twoEquipped布尔两本档GET无mode/无蓝，读取零写；旧槽1卸下/入悟补位仍有效，没有默认第三本 | PASS |
| T3Q-10 | 五种不合法人工档启动拒绝且源/角色不改：第三槽空、蓝错位、混twoEquipped、混ownedOrder、单武学checkpoint混threeSlots | PASS |

动作body仍沿用既有合同，装卸无expectedRevision参数；以上重复请求是本地幂等语义，不宣称原版相同。失败注入只替换本测试目标路径为空目录，后恢复备份，未操作用户或主会话存档。

## 页面状态与边界

**T3Q-UI NOT_RUN**。本轮内部浏览器技能不可用、旧绑定失效，由主会话报告；没有启动宿主浏览器或把接口结果算页面通过。

待内部浏览器可用后主会话应检查：显式三槽样本进入列表有蓝/入悟/上勾；编辑只允许第二槽卸，第一/三槽无可执行卸下；中槽为空后入悟可补回且第三槽位置保持；auto恢复满态；返回/刷新持久；停服失败不假成功且恢复需重读。普通新角色和旧两本不出现默认蓝或三槽能力。实际客户端行为未由本报告执行，不能标双层PASS。

本轮没有升级蓝色武学、新增材料来源或自然角色获取第三本；未新测上勾升级并发，既有成长/材料只验证装卸前后保持。未覆盖提交成功后丢响应、多进程写同档、视觉1:1或原版自然闭环。

## 后端源码SHA256

以下均与执行结束一致：
- server/martial-store.js: `3cb802e446d6a46475d2f15b5eeaec52cfbacdfa9a34b3a49d5490b487ce59f2`
- server/store.js: `7e5ab8353d24b9a764d8acb802359c29b4665e355e11eda6a16459d1e29fd6d1`
- server/app.js: `1e95528fb92d5009c8b939af0d969f5725d1c5db11e5259c6cfb793b9b1b9763`
- server/migrate-assets.js: `95d5daff6ce887890b3f9a363223e09fc24bfe1f841918abeb5be5a9e72302e6`
- server/assets.js: `820eeab6232b874e8952b3ebe42e244b23ff77e0a7fc3694fe04c00471b04621`
