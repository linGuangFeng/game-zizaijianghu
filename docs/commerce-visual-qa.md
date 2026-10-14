# 首日测试购买页布局独立QA

## 原图与业务边界

实际view original-first-offer-stable.jpg，不使用误名的recharge-offers主场景图。1280×720截图中405宽游戏主体显示荡剑式大型人物插画、金色宣传框、三日权益三行、底部¥6及右上关闭。首日可见武学1、票40、元宝60；这里仅核图，不在原版付款或领取。

原图首日行约y442..496，后两行约500..608，购买约620..656。上述为人工近似基准，不设任意像素合格阈值。本地仅首日测试订单和独立领取；后两日/复购未实现，人物/奖励图标/原遮罩未恢复，不能把横排和暖金色当1:1。

## 实际代码审查

读取displayCommerce/readCommerce/writeCommerce/commerceControls。价格由product.price currency/minorUnits格式化；奖励和grants由真实响应生成，order/canPurchase/canClaimDay1控制按钮显隐及禁用，购买paid不自动claim。失败commerceReady=false锁写并露重读，版本冲突只重读不重发；原消息aria-live保留。

HTML需保留测试环境直接成功且不实际扣款说明、未接入可用荡剑式、历史总量未知、后两日/复购限制，以及原asset-summary读取入口。领取记录不能当总钱包余额或技能学会状态。新增布局仅commerce-panel和专属类，不改app或其他域样式。内部Browser未提供，UI NOT_RUN。

## 最终审查与回归

最终HTML保留所有commerce ID、消息role/status/aria-live、奖励与领取容器、购买/领取/重读/返回事件节点。原asset-summary含asset-message/accounts/entries/retry-assets完整保留；商品插图区为aria-hidden空占位，未伪造人物。暖金框、首日三列仅commerce范围和专属ID，未覆盖hidden规则。app.js与九品上轮哈希一致，原测试支付和权益边界说明均保留。

静态布局不复制原三日行与遮罩，只有220高空图区和首日三列文字，订单/错误/记录/资产在下方正常文档流。实际滚动可见性、点击和窄屏未验，不称原弹层或完整商品复刻。

独立复跑现有 `node --test test/server/commerce.test.js test/server/assets.test.js` 17/17 PASS，0失败，exit0，1346.0991ms；`node --check client/app.js` exit0。覆盖旧读取不迁移、paid与首日领取分步、重放/并发、失败不半写、绑定、真实重启及统一资产事务。未新增VM支付点击用例，HTTP/CLI通过不等于页面通过；UI仍NOT_RUN。

原始输出`.local/independent-qa/commerce-layout-tap.txt`；退出码与前后哈希`.local/independent-qa/commerce-layout-result.json`，五文件前后一致。本轮工具正常，无新增中断。

|文件|SHA256|
|---|---|
|client/app.js|870736BAEC07300C21AED9E3C62F1D94423FB557129B7F911C926D65FD527B86|
|client/index.html|2C0EAD7FA76D4975C2B6015975131EA394B61B7ECBA8FA4A019C393951DD14AA|
|client/styles.css|E35BF73D2C9BAE0293CC8F9364AEF6483828F9D171C7180337DDF27CA5482FA0|
|test/server/commerce.test.js|026D3544EF51A2CD80E7F9BD5EB8DB4A46981CBFC467E997D93C66D0D8494C00|
|test/server/assets.test.js|6717676E481C6F1FC402366E1D649E6F5E587F0505027B41FC26E3B02062E2EC|
