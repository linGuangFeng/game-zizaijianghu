# 九品训练布局独立QA

## 原图与静态审查

逐图view original-realm-nine-before.jpg、original-stage2-first-train.jpg、original-third-66.jpg。主体约405×720，前者第一重0/39、三卡0/53、阅历120、属性40/20/2500；第二张第二重1/54、卡11/13/16、属性72/38/4760；第三张仍第三重66/66、三卡53/53及已达瓶颈、属性156/78/8830。第二/三张资源2.02万/1.97万是缩写，不推算精确差额。

原图境界名约y375、条392..404、属性431、三卡455..595。源码新增九品专属progress，max/value直接取ninth.progress.target/current；原ninth-progress文字保留。布局限定ninth-training-panel及其可见父壳，不把复用realm-training-card的新布局规则污染初入境界或首次突破；人物区域为空占位，无原人物/圆台/背景素材。

已读displayNinthTraining/trainNinth/breakthroughControls：stageName、资源、属性及卡片从真实state读取；limit与count及supported决定dataset.unsupported，统一controls控制disabled。失败仍breakthroughReady=false禁写并露retry-ninth；版本冲突只读恢复。新增两赋值没有代替原进度、规则或按钮事件。原ID及消息节点保留。

UI NOT_RUN：当前Browser未提供，无宿主浏览器操作。上述仅静态基准，未验精确颜色、排版遮挡、滚动、窄屏与真实点击，不称1:1。

## 独立复跑

本轮先前代理turn被主报告Selected model is at capacity中断，主已通知监听；单次恢复后先确认本报告未存在，再实际exec读取代码及view三图成功，已向主报告恢复。未将中断当测试失败或通过。

独立读架构新增四项后执行 `node --check client/app.js` exit0；`node --test test/server/martial-client-recovery.test.js` 原16+新增4共20/20 PASS，exit0，8543.694ms。

|新增真实HTTP+VM覆盖|结果|
|---|---|
|人工已有域38/39训练→第二重0/54，value/max/text一致；新VM GET保持且不写|PASS|
|人工已有域53/54训练→第三重0/66，value/max/text一致；新VM GET保持且不写|PASS|
|第三重65/66→66/66，仍stage3，气血8830，三按钮瓶颈禁用且再点不发POST|PASS|
|rename失败维持0/54/rev4，禁写；恢复GET后明确再点→1/54，余额100→84|PASS|

全部fixture是人工隔离既有域，非正常获取或新授资源。新VM不等于页面刷新、真实HTTP不等于浏览器；本轮未新增并发/延迟GET/提交成功丢响应/真实CSS点击测试，不把原武学用例泛作九品同类覆盖。

原始输出`.local/independent-qa/ninth-layout-tap.txt`，前后哈希/退出码`.local/independent-qa/ninth-layout-result.json`。四文件前后一致。

|文件|SHA256|
|---|---|
|client/app.js|870736BAEC07300C21AED9E3C62F1D94423FB557129B7F911C926D65FD527B86|
|client/index.html|6C890F8D4B79794E295EED2364E2B2E45CF896791E0C8DEFF459E833536D1551|
|client/styles.css|644091012A40E3338B4685D5D6DDF397E529BB13C214D0ACFF24F349B034C4C3|
|test/server/martial-client-recovery.test.js|AA7F926A38055163B2FE77865C19EB02170CEE850F1A6932E0F8722CDE78224B|
