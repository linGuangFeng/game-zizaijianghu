# 参考图鉴详情局部布局独立QA

## 证据及数据边界

实际view original-martial-detail.jpg：原图标题是武学养成，包含上勾拳Lv1/0星/控制/7.3秒、演示、属性20+20/10+10/1000+1000、天赋及材料0/1/升级。不是已取证的原版独立图鉴页。本地只是以此作为只读参考详情的纸框和分区依据，不证明原站另有同样图鉴流程。

已读server/martial-catalog.js及showMartialEntry：文本来自reference-catalog，descriptionComplete=false，Lv50/75天赋文字亦未完整。20+20是原图当前与绿色预测的文字记录，不是玩家当前40攻击，不用于战斗公式；此参考等级1不跟随玩家升级。保留“参考资料 · 只读”“说明未完整收录”及天赋缺文提示。

## 最终静态审查

HTML新增摘要包裹及aria-hidden空预览，原martial-detail/title/facts/description/description-incomplete/attributes/talents/back-martial-list全部保留，动态容器内没有静态装饰。样式为详情专属ID与限定子类；返回原列表事件及隐藏机制未改。app/catalog零改，未加升级、材料、动效或推测玩法。

原图纸框约主体内x17..390、y110..615；本地只近似色框和摘要/属性/天赋分区，静态文本及空预览不等于原动画或完整内容。内部Browser未提供，UI NOT_RUN；未验真实排版、返回点击、窄屏或视觉1:1。

## 独立针对性复跑

- `node --check client/app.js` exit0。
- `node --test test/server/martial-catalog.test.js` 2/2 PASS，exit0，551.8612ms，真实HTTP目录及无写验证。
- `node --test --test-name-pattern="catalog" test/server/martial-client-recovery.test.js` 5/5 PASS，exit0，1965.6445ms，旧异步目录fetch/json乱序及离开列表失效。

5项是既有列表逻辑回归，不是本轮详情渲染点击全流程，更不是页面。未新增镜像测试或重复全套。本轮无工具异常。

原始输出`.local/independent-qa/catalog-detail-http-tap.txt`与`catalog-detail-vm-tap.txt`；退出码/前后哈希`catalog-detail-result.json`，六文件前后一致。

|文件|SHA256|
|---|---|
|client/app.js|F6ACD20EB98F31D45235E60338D5D6150BC6D0015BA024F94F6B81383058A172|
|client/index.html|1676F0D929849F8FBA74CB899AFB0E09EA5DB3CD4A0577EC2711237F48710A33|
|client/styles.css|E407FF6390B746BE51A87E1A9A5440FD178AAC20143214CEE83B91D056DA7634|
|server/martial-catalog.js|C3472CC181A7EDA85772AA5F0AC55E65A36574A739B402009A8C6B0E042C83A4|
|test/server/martial-catalog.test.js|2B0B5EF66975A8F7B3B7DBF83357880E567F7D39C20772075692FC70F9864395|
|test/server/martial-client-recovery.test.js|2424E2723BA3182D58BF7B11DB9A40A243440B43247278EB31058F10876DBB33|
