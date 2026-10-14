# 上勾拳养成布局独立QA

## 原图核对

实际view original-uppercut-upgrade-before.jpg、original-uppercut-upgrade-after.jpg、original-uppercut-material-tooltip.jpg。before当前Lv1、攻击20/防御10/气血1000；后面绿色+20/+10/+1000是预测增量，不是当前总值。after当前Lv2、40/20/2000，仍显示同样绿色预测；不能因此认定本地开放Lv3。材料栏2/1→1/1，tooltip另明确上勾拳数量1及藏经阁来源。

原图405宽主体内约x17..390、y110..615是养成纸框，顶部预览约x29..240/y154..295，右侧等级；属性约y420/443，材料约y553，升级约y581。星级/天赋/演示/升星标签可见，但未由本轮实现。坐标为人工近似参照，不是像素通过标准。

## 代码语义与静态范围

读取displayPlayerMartial及升级handler。等级/属性来自growth.uppercut，不把绿色预测加到当前值；材料null显示未确认并禁升级，0不足、supported=false或未ready也禁用。升级前锁写，版本冲突只GET，未知失败保持锁直到重读，finally仍更新资产读取。返回/重读原事件不变。

HTML保留player-martial-detail/title/facts/material/limit、upgrade-martial/retry-player-martial/back-player-martial。空预览在动态facts之外，不被replaceChildren误删；材料/限制整段textContent仍由原逻辑填入。纸框、预览占位、等级右列及属性两列规则为专属ID或面板限定，图鉴未改。原图素材、动态演示、遮罩、升星/天赋/来源跳转未实现，不增加假入口。

UI NOT_RUN：内部Browser未提供；静态布局及接口测试不等于真实页面、精确排版或1:1。

## 最终回归记录

最终app.js与此前哈希一致。独立复跑 `node --test test/server/martial-upgrade.test.js test/server/martial-assets.test.js` 13/13 PASS，0失败，exit0，1654.4042ms；`node --check client/app.js` exit0。仅复用既有升级/统一武学HTTP测试，未新增或宣称养成Node VM点击测试，也未重复全后端套件。

原始TAP `.local/independent-qa/uppercut-layout-tap.txt`，退出码/前后hash `.local/independent-qa/uppercut-layout-result.json`。五文件前后一致。本轮工具无异常。页面UI NOT_RUN仍保留，原版Lv2可显示绿色预测不等于本地支持后续升级。

|文件|SHA256|
|---|---|
|client/app.js|870736BAEC07300C21AED9E3C62F1D94423FB557129B7F911C926D65FD527B86|
|client/index.html|40CE4F77E0D2205468B67FE99F308BF178C562C7EBE7B6E9D63D4A0FCFB3EEDF|
|client/styles.css|4F3C959DD9A0E54951A640B2AE2DB378CF7E2A335802D4FBB765A8478F892733|
|test/server/martial-upgrade.test.js|5BBDA1ADBD81801443CF7ACC8618DA4DFE326553B4624C37733AA6B49849465A|
|test/server/martial-assets.test.js|B0946C6FD8E00AD9EC5C55549773CC5D931BBC94A70E2D321FBF1FCBB555409B|
