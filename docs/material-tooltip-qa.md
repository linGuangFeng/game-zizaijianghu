# 上勾拳材料弹层独立QA

## 已核证据及范围

本轮重新view original-uppercut-material-tooltip.jpg，并读event6-evidence末节。原图明确上勾拳/数量1/藏经阁/前往藏经阁获得/点击空白处关闭弹窗。原版前往按钮没有点击取证；本轮不实现来源导航，不新增API、材料赠送或抽取规则。

本地应从equipmentState.growth.uppercut.material取name/quantity，null显示数量未确认而不是0，数值0原样保留。ready且非equipping才允许打开。进入读取或任一武学写入、离开详情时应关闭旧弹层并禁入口，不能展示已失效材料；成功重新取得state后可再打开。内容点击不关闭，背景空白关闭；辅助关闭按钮是本地可访问性补充，不称原图已有。

当前内部Browser未提供，UI NOT_RUN。Node VM仅调用处理器和构造target/currentTarget，不具有浏览器事件传播、焦点管理、模态背景阻断或真实排版；有role/aria不等于这些能力已验。实际焦点、键盘、滚动和点击需后续页面验收。

## 最终实现独立审查

最终使用原生dialog；材料入口同ID改button，带aria-haspopup和aria-controls。打开guard为ready、非equipping且存在growth，name/quantity来自当前材料，showModal前取消hidden。close清名称/数量，关闭原生dialog并hidden；背景target===currentTarget、辅助按钮、cancel三个分支可请求恢复焦点。读取/四类写入/离开详情调用关闭不请求恢复焦点，禁入口并显示待重新读取。

已逐调用核showPanel、readCheckpoint、auto、unequip、equip、upgrade起点均关闭和禁入口。成功后通过displayPlayerMartial恢复，失败保持禁用。素材仍缺，无来源前往按钮或任何新请求。辅助关闭及cancel/focus是本地可访问性实现；原生效果未由VM证明。

## 独立实际回归

读最终测试实现后复跑 `node --test test/server/martial-client-recovery.test.js`：原20+新增6共26/26 PASS，0失败，exit0，12648.1627ms；`node --check client/app.js` exit0。未重复架构全量127。

|材料专项|结果|
|---|---|
|人工数量2/null/0三例，真实state显示区分；内容target不关，背景/辅助close/cancel分支关闭；零新增请求、存档不变|PASS|
|GET开始立即关闭禁入口，失败持续锁；成功GET恢复，返回关闭，零POST|PASS|
|正常升级2→1，起点关闭禁入口，成功再打开为1，Lv2禁升级|PASS|
|真实升级已提交后模拟丢响应，入口持续锁，GET再失败仍锁；成功GET恢复1且升级POST仅一次|PASS|

原六装卸失败恢复用例另增加材料入口disabled断言。测试中部分用例在弹层打开后通过VM直接调用后方升级/重读/返回处理器，以验证防御关闭路径；这不说明原生模态允许用户点击背后按钮。VM showModal/close只模拟open，focus空操作，cancel直接传事件，不能等同真实焦点回归、inert、Escape或事件冒泡。UI NOT_RUN保留。

原始TAP `.local/independent-qa/material-tooltip-tap.txt`，退出码及前后哈希 `.local/independent-qa/material-tooltip-result.json`，四文件前后一致。本轮测试正常；执行先返回运行session后正常轮询exit0，不是中断。

|文件|SHA256|
|---|---|
|client/app.js|6CB6D3B36660C9527CABBF9C1E8A597A6DBAA842E411B51F5B30CD8A25614BE5|
|client/index.html|771E92FA7813E68B36E0B9CE8C311E11B427387175D3A2A052C73ABEF90712C4|
|client/styles.css|0977D3DD27F632CED6C269024605BF72DC4A804E0FB1CAA81B498AEC69050AB5|
|test/server/martial-client-recovery.test.js|B033B28F2B7C76CD0FE46BAABEFFCF62025D74106B4071CEDC8178E8676FFEB0|
