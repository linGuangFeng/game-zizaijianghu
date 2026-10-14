# 装备页布局独立QA

## 原图核对与范围

实际查看 original-blade-purple-after.jpg、original-equipment-blade-gold.jpg、original-equipment-replace-list.jpg。主体在1280×720截图约x437..842，宽405。当前内部Browser技能未提供，UI NOT_RUN；本报告的静态核图和接口回归不等于浏览器点击、布局通过或视觉1:1。

- purple-after：人物及右侧装备在上部，基础属性标题约y456；两列属性约y482/505，气血2.98万、防御300、攻击600、抗暴50；一键穿戴约y588。角色及多件装备图标不是本地已恢复素材。
- gold：实际为金色血战刀详情弹层，主体内约x61..350、y224..516。可读1阶、武力值2793、攻击96、防御48、气血4760、抗暴5，下部获取/更换按钮。不能把背后被遮挡的总属性当完整可读证据。
- replace-list：实际为血战剑两行1679列表，不是金紫血战刀对照。仅作列表视觉基准：主体内约x18..390、y104..613，纸色背景、青色标题、首两行约y146..225和y227..308，左图中名右动作。不能据此增加血战刀数量或物品。

这些坐标是人工近似参照，没有设定任意像素容忍度。缺原始人物/图标/纹理素材；精确排版、窄屏、滚动、遮挡须真实浏览器另验。

## 语义审查基准

读取现displayGear、gearControls、readGear、writeGear及事件。属性必须由GET200/state投影，装备总气血使用healthText原样，不把万字缩写换为猜测精确值。候选源state.owned且当前装配由equippedId判断；按钮dataset.equipped保持，已装备项禁用。

gear-equipped→详情、change-gear→候选、gear-auto→writeGear无itemId、retry-gear→readGear、back-gear→资料；相关按钮和候选容器必须保留在gear-panel子树，统一失败锁仅豁免返回/重读。未知写结果保留旧展示、禁写并提示重读；不能由CSS伪造状态。新增布局限定gear-panel，不能污染martial-card等其他页复用类。

## 最终静态结论与现有回归

客户端最终HTML仅增加overview/summary/actions/navigation包裹，原按钮、详情、候选均仍在gear-panel子树，ID/aria未换。新增规则使用装备专属ID或gear-panel限定类，可见父壳规则也限定装备页；复用martial-card没有新增全局规则。app.js哈希与上轮境界结果一致，属性/候选/动作投影未改。

静态布局overview高540，基础属性top444且2×2排序，装备入口右侧top350，操作/返回正常流。详情及候选位于overview之后并随展开增加页面高度，与原图覆盖弹层不同；本轮没有还原原弹层位置、关闭行为，也未增加获取/强化。此差异已与客户端确认并保留为视觉缺口。真实滚动、按钮可见性及触达仍需浏览器。

独立复跑现有 `node --test test/server/gear-state.test.js test/server/gear-unified.test.js`：13/13 PASS，0失败，exit0，1326.4498ms；`node --check client/app.js` exit0。现有HTTP/CLI覆盖金紫与auto、旧版本/并发/no-op、落盘失败、重启、绑定、主档迁移和跨域。没有新增装备Node VM测试，13项不验证HTML点击或CSS；静态语义审查与接口回归分别记录，UI仍NOT_RUN。

原始TAP：`.local/independent-qa/gear-layout-tap.txt`；前后哈希与退出码：`.local/independent-qa/gear-layout-result.json`，下列五文件前后一致。

|文件|SHA256|
|---|---|
|client/app.js|CB8D7C76E965FA0CE9D4B23ACABF93D6B04B3493FC13CE743AA8B108F9476B3B|
|client/index.html|0683DFD99A1766B91FD4F12690E39C9B2DFEA406DACF8C95CBB488E0C75FAA84|
|client/styles.css|245135375E90E508FE35461E3D60684AB1D15DE0AF59793CC123ED4376CB62C2|
|test/server/gear-state.test.js|0D7A50A26A0E2A157BB71A314405D9B1C9A01A53BEF3669E3136BA530490519E|
|test/server/gear-unified.test.js|29FB6E3CB690B1CE6D21574A38E5386A5B6D19CFE4C18F224EFC53E2595AEFF3|
