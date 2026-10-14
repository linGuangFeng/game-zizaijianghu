# 首次突破布局独立QA

## 原图与范围

实际view原图original-breakthrough-ready.jpg、original-breakthrough-claim-event.jpg、original-breakthrough-result.jpg。均1280×720，主体约x437..842宽405。内部Browser未提供，UI NOT_RUN；静态核图和HTTP不能代替页面验收。

ready展示初入江湖→九品前期预览，攻击30→40、防御15→20、气血2000→2500、领悟收益100→150。三条件通关事件5(1/1)、装配2本武学(2/2)、境界修炼30次(30/30)各显示5张奖励；三卡主体内x约29/150/271，y509..648，宽约106高139。此ready文件仍有三个完成按钮，不能按文件名认定奖励已领齐或可直接突破。

claim-event为暗色遮罩的恭喜获得/宝典令5，背后首卡已完成。result为功力突破遮罩，明确上述四项前后值及九品前期，非第二次突破。原图背景人物、特效、票图、遮罩、点击空白关闭未由本轮静态布局恢复；坐标仅人工近似基准，不设任意像素合格阈值。

## 事件与数据审查

已读displayBreakthrough/readBreakthrough/writeBreakthrough及controls。条件卡取真实conditions，领取按钮保留dataset.claimed，原按钮须留在breakthrough-panel子树接受统一失败锁；canAdvance控制突破按钮、advanced控制结果、ninthTraining控制继续修炼。奖励仅成功响应新增receipt时显示，关闭只设hidden，不再次领取。冲突只重读，未知写结果禁写并提供重读。

上方属性取state.realm，结果文本是现有首次突破参考30/15/2000/100→40/20/2500/150，不能泛作后续突破实时比较。布局只改HTML/CSS，不改app或扩充第二次突破条件。

## 最终静态审查与回归

最终布局仍以breakthrough-panel及专属ID限定，realm-seat仅在该面板变更，未把三卡规则应用至九品训练。原消息role/status、按钮ID、隐藏节点及条件容器保留；actions仅包裹原操作。app.js与上轮哈希相同。人物区域342高，三卡约y509起、三列约107×139；上方只有实际当前属性，没有原图左右目标预览。奖励/结果为内联面板，非原遮罩，也没有点击空白关闭；素材、特效、精确排版仍缺。不能称1:1。

执行记录：首次工具调用进程创建返回 `CreateProcess TurnAborted`，没有测试结果；立即通知主控，主控已转监听。只读检查确认TAP/result文件均未生成后，重试一次成功。异常和恢复分开保留，不将首次调用记为通过。

恢复后 `node --check client/app.js` exit0；`node --test test/server/breakthrough-state.test.js test/server/assets.test.js` 17/17 PASS，0失败，exit0，1308.6539ms。复用既有HTTP/CLI覆盖三receipt、advance、重放/旧版本、并发、失败原子性、真实重启、绑定和schema2新奖励+5及历史不补。本轮没有首次突破Node VM点击测试，接口通过不等于HTML/CSS或浏览器通过。UI仍NOT_RUN。

原始TAP：`.local/independent-qa/first-breakthrough-layout-tap.txt`；退出码与前后哈希：`.local/independent-qa/first-breakthrough-layout-result.json`。五文件前后一致。

|文件|SHA256|
|---|---|
|client/app.js|CB8D7C76E965FA0CE9D4B23ACABF93D6B04B3493FC13CE743AA8B108F9476B3B|
|client/index.html|D74851B2AE4BC7BDE4C2E52F062726C3392F6D236CCF5C164EE3ED5189153DD1|
|client/styles.css|43A28E6DC60430BC200CEE480D186552D094F40955E154444AB78BA422D453AF|
|test/server/breakthrough-state.test.js|7B2BF5BB2CA31EBC499321077FC5FAFB1B6F2C1D3625C427109A60F20C176900|
|test/server/assets.test.js|6717676E481C6F1FC402366E1D649E6F5E587F0505027B41FC26E3B02062E2EC|
