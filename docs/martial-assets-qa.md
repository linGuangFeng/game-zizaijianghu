# 武学统一资产事务独立 QA

2026-10-13（Australia/Perth）。执行者：本地 Codex 独立 QA，不是 Grok。仅隔离 HTTP/CLI 与本文记录；未操作浏览器、未修改实现、未提交 Git。

## 结果与证据

独立实际执行 **10/10 PASS**，仅放行下表接口与离线迁移范围。页面 **NOT_RUN**，由主会话另行验收；不表示原版 1:1 或自然获取材料流程完成。

- 脚本：`.local/independent-qa/martial-assets-suite/http.mjs`
- 运行：`node .local/independent-qa/martial-assets-suite/http.mjs`
- 报告及全部隔离数据：`.local/independent-qa/martial-assets-yrUEWd/result.json`
- 执行时间：2026-10-13T08:58:11.164Z；真实 Node 服务采用系统分配端口。
- `server/store.js`、`assets.js`、`migrate-assets.js`、`martial-store.js`、`realm-store.js`、`app.js`、`index.js` 的执行前后 SHA256 完全相同，完整值见报告，`codeChanged:false`。
- 所有材料与境界余额均为人工隔离夹具；不是生产赠送、抽取结果或自然奖励。CLI 只在对应自有服务进程停止时执行；未迁移主会话或用户存档。

| 编号 | 实际验证 | 结果 |
| --- | --- | --- |
| MAQ-01 | 旧角色及旧布尔武学档 GET 投影 revision 0；assets 404；主文件字节/mtime 不变，武学侧档字节不变 | PASS |
| MAQ-02 | 先仅迁 realm 并实际消费 12，再单独追加 martial；主余额保留 108；材料 1；martialDigest 等于源字节 SHA256；重复同时传两域不写、不重导入 | PASS |
| MAQ-03 | 将隔离主文件位置临时替换为空目录，使最终写入失败；分别升级、境界训练、首日领取均 500；各域 GET 与账本内存状态、原文件备份字节完全不变，恢复后可继续 | PASS |
| MAQ-04 | 两个同版本升级、一次 realm 训练、首日领取、同身份角色 PUT 并发；状态码 200/409/200/200/200；只升级一次至 Lv2，材料恰扣 1 至 0，只有一条 martial-upgrade；经验 96、宝典令可用 40、元宝可用 60，commerce 三流水保留，所有域无丢失 | PASS |
| MAQ-05 | 已装配 auto-equip 幂等无文件写；旧升级版本冲突，当前 Lv2 再升级拒绝；实际卸下/装配分别增加武学 revision，成长保留；资产状态/revision 不随装卸变化 | PASS |
| MAQ-06 | 真正停止并重启服务 PID 67900→69740；重启前故意将保留的两个旧侧档写成非法 JSON，主域仍完整恢复并可装卸，旧侧档字节未被读回覆盖或写入；恢复源后重复迁移不重置已消费状态 | PASS |
| MAQ-07 | 源材料更改造成 hash 不符，CLI 拒绝且主档字节/mtime 不变；角色改名保留 domains，assets 与升级分别按绑定错误拒绝；离线迁移也拒绝绑定不符 | PASS |
| MAQ-08 | 已迁入未知材料仍出现账户，total/available 均 null；升级 martial_material_unknown，主文件无写 | PASS |
| MAQ-09 | 明确 0 材料账户 total/available 为 0；升级 martial_material_insufficient，主文件无写 | PASS |
| MAQ-10 | 未迁移旧模式升级成功仅改武学侧档，原角色字节不变、assets 仍 404；随后错误角色绑定源不能导入 | PASS |

## 放行边界

同文件原子提交的故障验证覆盖升级、初始境界训练与首日领取；并发覆盖共享主文件多个域和重复升级。未模拟提交成功后丢响应、操作系统崩溃或多服务同时写同一个文件。装卸请求沿用既有正文合同；没有假定其拥有新的 expectedRevision 参数。

未知宝典令/元宝总余额仍为 null；这里只记录本地测试首日来源的可用量。荡剑式保留为商品发放流水，不新增可用武学或资产账户。材料未知 null 与明确 0 区分，未引入抽奖概率、重复武学转换规则、自然材料获取或自动迁移。实际 GET 没有产生迁移；重复请求无写是本地合同，不宣称原版协议相同。

当前脚本验证 realm 旧训练域的跨域事务；九品训练此前独立验收另见 `assets-realm-qa.md` 和 `second-stage-qa.md`，不把本次训练样本扩称为所有玩法覆盖。主会话UI验收见后续补充，视觉1:1未验收。

## 主会话内部浏览器验收补充

主会话用3015隔离副本：复制此前schema2资产页面样本（已领取40/60，九品训练后阅历104），另将既有两武学存档复制并显式设置相同角色绑定、上勾拳Lv1、材料2、revision0作为人工测试输入。离线单独`--martial`追加后，旧realm104和commerce保持。测试不会向正式角色赠送材料，不代表自然来源。

| 页面操作 | 实际结果 | 图证 |
| --- | --- | --- |
| 角色资产、武学→上勾拳养成 | 材料余额2；Lv1，20/10/1000，升级消耗1；原阅历104及40/60保留 | [升级前](evidence/local-martial-assets-before.jpg)及DOM |
| 停止3015后点击升级 | 结果待确认、按钮禁用，仍Lv1/材料2；没有假成功 | [停服](evidence/local-martial-assets-offline.jpg) |
| 新进程同档重启，点击重读 | 恢复Lv1/材料2，无自动重放 | 主会话DOM记录 |
| 第二页同版本升级 | Lv2、40/20/2000、材料1，后续升级禁用 | [成功](evidence/local-martial-assets-upgraded.jpg) |
| 首页旧版本点击升级 | 提示记录已更新，只读恢复Lv2/材料1，不重复扣材 | [冲突](evidence/local-martial-assets-conflict.jpg) |
| 刷新→角色 | 材料实际余额1，+2迁入及-1升级流水，阅历104及币新增量40/60保留 | [账本](evidence/local-martial-assets-ledger.jpg)及DOM |

另在3016新隔离旧角色/武学副本显式将材料设置null后迁入。角色资产显示[材料数量未知](evidence/local-martial-assets-unknown.jpg)，武学养成显示数量未确认、升级禁用；没有显示0或发放材料。主会话未操作未知材料升级接口，拒绝错误码由独立HTTP覆盖。

主文件核对：assets revision4、6条entries，martial revision1/Lv2/materialQuantity1，realm104保持。主会话核独立报告7个实现文件SHA-256全匹配。本轮局部接口与页面双层PASS，MAQ-UI PASS。未做视觉1:1验收、自然材料获取、可用荡剑式或所有武学成长。

随后同页面进入境界继续练武一次：阅历104→88、1/39→2/39、攻击42→44；返回角色，[跨域结果](evidence/local-martial-assets-cross-domain.jpg)及DOM确认材料仍1，充值40/60保持，流水仅追加一次阅历-16。这是顺序跨域页面验证，并发由前述独立HTTP覆盖。
