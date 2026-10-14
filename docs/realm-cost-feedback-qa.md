# 初入境界成本不足反馈独立QA

## 证据门槛与撤回范围

原original-train-ten-total.jpg已逐图核余额0、未满三卡的消耗12为红色，realm-equipment-evidence第75行亦记录。此事实支持不足成本标色。

不能将original-train-insufficient.jpg文件名推为“零余额再点训练自动打开弹层”。realm-equipment-evidence第65至75行记录训练到0，77行只证明数量0和来源内容，未记零余额后触发动作；79行只说明已关闭返回，未给关闭点击。resource-tooltip实图为余额72/进度4/30右上浮动说明，不能补足0余额弹层触发证据。realm-qa第59行“再点拉练不足”是本地UI测试，不是原版证据。

因此本轮撤回自动不足弹层实施范围，仅保留已证标色。原图“点击空白处关闭”是界面声明，有关闭结果报告，但实际空白点击链路仍缺；来源跳转亦未验。后续需新的明确原版操作证据才可重新批准，不从名称或现本地行为倒推。

## 实现静态核查

已读最终代码：displayRealm新增data-insufficient = count<limit且真实resource.amount<training.cost；恰好等于成本不标，满卡不标。CSS仅#realm-panel对应属性选择器设置红色，九品样式不变。未改训练请求、禁用计算、数值、消息或添加自动GET/弹层。源码选择器存在不等于浏览器已渲染正确，UI NOT_RUN。

## 独立针对性复跑

读新增用例后执行 `node --test --test-name-pattern="^realm " test/server/martial-client-recovery.test.js`：4/4 PASS，exit0，2234.601ms；`node --check client/app.js` exit0。只跑指定4项，未重复全量。

实际覆盖120充足不标；恰好12不标→真实训练扣至0未满卡标true且仍可点；再点仅原服务端不足消息，档不变，不加realm GET；人工29/30余额12→满30余额0，全部瓶颈禁用且不足标记false；原持久失败锁及GET恢复用例仍通过。余额11未单独测试，不宣称全数值穷举。

使用真实HTTP和Node VM DOM替身验证dataset/请求/存档，未验证CSS视觉颜色或浏览器点击。原始输出`.local/independent-qa/realm-cost-tap.txt`；退出码/前后哈希`.local/independent-qa/realm-cost-result.json`，三文件一致。本轮无工具异常。

|文件|SHA256|
|---|---|
|client/app.js|F6ACD20EB98F31D45235E60338D5D6150BC6D0015BA024F94F6B81383058A172|
|client/styles.css|D680E8DAF176C7F613716CEDB28F820B7390CE05CC90BCFEB323AE1D8C74CA6B|
|test/server/martial-client-recovery.test.js|2424E2723BA3182D58BF7B11DB9A40A243440B43247278EB31058F10876DBB33|
