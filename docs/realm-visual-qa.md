# 境界训练页静态布局独立QA

## 证据与边界

本轮逐图查看 original-train-before.jpg、original-train-insufficient.jpg、original-train-ten-total.jpg。此处原图均1280×720，主体约x437..842，宽405。没有运行内部浏览器，UI NOT_RUN；静态源码及Node VM替身不能判定页面点击或视觉1:1。

before显示初入江湖0/30、阅历120，攻击10/防御5/气血1000；三卡各0/10、单次12。ten-total显示10/30、余额0、三卡8/1/1、属性26/6/1100。insufficient文件实际为江湖阅历来源弹层，数量0；不能当作无遮挡训练页，也不能单凭文件名断言该图有不足toast。

## 布局可复核基准

以游戏主体为坐标系，人物圆台约y160..365，境界名约376；进度条y392..404、横跨约x69..338；属性在y430横列；三张卡约y455..596、每张约106宽，中间间隔15；底部类别约635、导航约690。上述是人工近似观察，不设未经约定的像素通过阈值。

图中人物、圆台、背景、右侧图标、装饰与导航需要素材与真实页面核对，CSS占位不能视为完成。三图只证明已见初期训练状态，不为其他境界增添规则。

## 源码审查基准

新增progress节点保留原realm-progress文字，max/value直接读取state.realm.progress.target/current，不能硬编码30或以经验推导进度。原realm-name、realm-resource、realm-attributes、realm-training、realm-task、realm-message、retry-realm、back-realm ID及事件含义需保留。realm-message应继续aria-live，并在未知写结果后保留原状态、禁写、允许只读重读。

ninth-training-cards复用realm-training与realm-training-card类，因此本轮新增布局必须限定#realm-panel；不能将初期训练的卡片高度/纸色/人物布局应用到九品页。最终测试与哈希在下节记录。

## 最终实现审查与回归

最终实现保留上述原ID。新增原生progress带aria-label及aria-describedby，displayRealm中只将target/current赋给max/value，同时更新原文字。realmControls仍依据realmBusy、realmReady、单项full控制禁用；持久失败catch令realmReady=false并露重读，没有乐观增加进度。新增样式均限定#realm-panel及其可见时的父壳，九品复用类未获得该限定布局。

静态尺寸：境界名top362/行高26，进度top392/高12/宽66%，属性top417，三卡top455/宽86%/gap14/高140。405宽时每卡约106.8，接近原图所见比例；人物区和图标仅占位。实际遮挡、字体、可点击区域、滚动和窄屏均未测，不能标视觉通过。

独立读取新增测试实现后，复跑架构编写的 `node --test test/server/martial-client-recovery.test.js`：原12项及境界新增4项共16/16 PASS，exit0，6769.8441ms。真实createApp HTTP与隔离临时文件、实际client/app.js在Node VM执行；DOM替身不渲染CSS。

|新增验证|结果|
|---|---|
|实际HTTP训练0/30→1/30，max30/value1及文字一致；新VM重新GET保持1且无写|PASS|
|临时目录阻止realm文件rename，HTTP失败保持0/rev0，训练禁用；恢复文件、GET后再次训练到1|PASS|
|明确人工29/30样本训练到30，三卡瓶颈disabled，再点不新增POST；余额100→88|PASS|
|普通角色无realm入口、无隐式realm文件、无POST|PASS|

没有把新VM称浏览器刷新；本轮新增4项没有测试余额不足弹层、延迟GET或境界提交成功后丢响应。原12项武学丢响应结果不能转作境界同类覆盖。UI NOT_RUN保留。

原始TAP：`.local/independent-qa/realm-layout-tap.txt`。结果和前后哈希：`.local/independent-qa/realm-layout-result.json`，四文件前后一致。

|文件|SHA256|
|---|---|
|client/app.js|CB8D7C76E965FA0CE9D4B23ACABF93D6B04B3493FC13CE743AA8B108F9476B3B|
|client/index.html|57B7CBDDB0D8C3BC85E61C689F384FF0B71760BA66DEB5AF0ACDB41D68061153|
|client/styles.css|9C2F2CD0EC89DC7E6DDADDCC59F1D1F59F5AFF83FDD0503322CB47085B547BAE|
|test/server/martial-client-recovery.test.js|09E414946A6FE26C16DB2AF17221BC68BB624CFFAA090BD57FCA7F2DE1949C33|
