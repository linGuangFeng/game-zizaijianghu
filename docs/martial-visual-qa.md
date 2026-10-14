# 武学布局静态独立审查

## 范围与结论

实际查看 original-martial-list.jpg 和 original-third-martial-middle-restored.jpg，并读取 client/index.html、client/styles.css。本报告是原图与源码静态基准，不是浏览器截图验收。当前内置 Browser 未列，UI NOT_RUN；不使用宿主浏览器。

## 可复核基准

两张原图都是 1280×720，游戏主体位于约 x437..842，宽405。以下为人工观察近似坐标，不是像素误差门槛；槽坐标以游戏左上角为原点。

|对象|原图可见事实|当前源码|
|---|---|---|
|主体|405宽纵向纸色面板，棕色边框及横向分隔|equipment-panel纸色渐变、双线棕框，容器max405|
|六槽|中心约(62,161)、(118,199)、(175,161)、(232,199)、(288,161)、(345,199)，直径约50|top136，六列，偶数向下38；圆形aspect-ratio1|
|分类/已有|分类约y250..292，已有标题约y304|board高290，已有标题26；没有原图分类按钮|
|卡片|四列，首行书册约y330..400，名称约y423；第二行约y463开始|四列grid；卡片62+16+至少30高、间隔12；书册只透明矩形占位|
|操作及导航|装配与升级约y590，类别约y635，六导航约y690|保留已有一键装配/重读/返回；不虚增未实现的一键升级和导航|
|三槽状态|蓝色第一、入悟第二、上勾第三；后3锁；已装配标识与等级|语义继续由真实state渲染，不由CSS伪造|

原图的书册/人物/框饰/纹理/图标均未由上述CSS恢复，纸色近似不等于素材一致。蓝色武学正式名称仍待核，不从图形猜名称。窄屏、字体换行、按钮遮挡、实际颜色和整体高度需恢复内置浏览器后实测。

## 变更后必要检查

保持equipment-title、equipment-slots、equipment-owned及装配/编辑/重读/返回原ID和状态关联；状态错误可见，锁槽提示仍可点，不绕过未知写结果锁。图鉴请求游标及业务逻辑不在本轮样式变更范围。待最终版复跑已有12项HTTP+Node VM脚本，仅验证逻辑，不授予页面PASS。

## 最终HTML语义与脚本回归

客户端确认HTML/CSS最终稳定后，本轮独立复跑 `node --test test/server/martial-client-recovery.test.js`：12/12 PASS，0失败，exit0，耗时5467.9876ms。原始TAP：`.local/independent-qa/martial-layout-tap.txt`；前后哈希：`.local/independent-qa/martial-layout-result.json`，四文件执行前后一致。

实际HTML保留equipment-title的aria-labelledby、槽位ol及aria-label、任务aria-live、各操作原ID及hidden状态。仅增加布局包裹，实际行为仍由原app.js驱动；app.js哈希与此前回归版本相同。既有12项验证已提交丢响应/JSON失败后的禁写与只读恢复、旧单双本路径、图鉴乱序、离开图鉴失效、锁槽提示无写。本次是复跑既有测试，非另写独立套件；最小DOM不排版，不能证明CSS实际可点击、无重叠或窄屏通过。页面依旧NOT_RUN。

|文件|最终SHA256|
|---|---|
|client/app.js|9B2C17F2BCB6AAD97324910C6DADDE2973B2FA7533F4BE76ACFD7D5C0254DA24|
|client/index.html|240269FE751DA63C87CA659569D573F2261370C62FB03D36A63B3B2724556AAD|
|client/styles.css|449FB4C3AACDA30192105ACB2FA159C3B952B18E40EFE9CEBE726304B188C709|
|test/server/martial-client-recovery.test.js|A063EDB0C77BB880C51E1076AEF60C630857034A90223A7D3E1376D6AFF81668|
