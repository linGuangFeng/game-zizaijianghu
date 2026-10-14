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

## 原生Browser验收准备（2026-10-14，NOT_RUN）

隔离样本已准备：`.local/material-native-i7SUeC/character.json`及同名`.martial.json`。角色“材料弹层原生验收”、appearanceId为male-reference-0002，武学character与角色完全一致；沿用observed-event1-before-equip，revision0、上勾拳/入悟两槽、上勾拳Lv1、人工材料2。不是生产赠送或新checkpoint。已用现有createApp校验成功，未listen、未启动服务或浏览器。

### 启动/停止（PowerShell，新专用终端）

```powershell
Set-Location D:\work\hd\game-zizaijianghu
$env:PORT='3031'
$env:CHARACTER_SAVE_FILE='D:\work\hd\game-zizaijianghu\.local\material-native-i7SUeC\character.json'
$env:MARTIAL_SAVE_FILE=$env:CHARACTER_SAVE_FILE+'.martial.json'
$env:REALM_SAVE_FILE=$env:CHARACTER_SAVE_FILE+'.realm.json'
$env:GEAR_SAVE_FILE=$env:CHARACTER_SAVE_FILE+'.gear.json'
Remove-Item Env:MARTIAL_CHECKPOINT,Env:REALM_CHECKPOINT,Env:GEAR_CHECKPOINT -ErrorAction SilentlyContinue
node server/index.js
```

以上仅修改专用终端进程环境，关闭终端即可丢弃，不改用户配置。不能用空字符串代替删除checkpoint环境变量。3031若占用，换空闲端口，不停止他人服务。仅在已加载的内部Browser访问http://127.0.0.1:3031；不自动打开宿主浏览器。结束在此终端Ctrl+C，确认进程退出且健康接口不再连通，再关闭终端。本次准备没有启动该服务，没有遗留进程。

另一终端只读预检：

```powershell
Invoke-RestMethod http://127.0.0.1:3031/api/health
Invoke-RestMethod http://127.0.0.1:3031/api/character
(Invoke-RestMethod http://127.0.0.1:3031/api/martial-state).state.growth.uppercut
```

预期角色如上，level1，material.name上勾拳、quantity2。

### 原生实际步骤及预期

1. 江湖→武学→非编辑“上勾拳养成”，等读取完成，记录本地网络请求。材料按钮可用、数量2。
2. 真实Tab定位材料按钮、Enter打开。dialog.open=true、hidden=false；名称上勾拳/数量2，document.activeElement位于dialog内。
3. 真实Tab/Shift+Tab不得落到背后升级、返回或导航控件；真实点击不得激活背景控件。不能用脚本直接调用背后handler替代。
4. 点击纸框内名称/数量保持打开；点击外部空白关闭。焦点回材料按钮，弹层旧名称/数量清空。
5. 再开后真实Escape关闭并恢复焦点；再开后辅助关闭按钮同样关闭恢复。VM调用cancel不能代替Escape。
6. 在405像素参考宽度及窄视口核标题/数量/关闭按钮可见，滚动及来源文字不遮挡关闭按钮。留实际截图/结果。
7. 全程不点升级/装卸，无POST/PUT/PATCH/DELETE；API再读仍revision0、Lv1、材料2，两个存档SHA256不变。不操作来源跳转，不声明已实现藏经阁。

### 只读哈希对照

准备时基准已存在样本目录before-sha256.json。前后执行以下命令并分别与基准逐项比对，不重写存档：

```powershell
Get-Content D:\work\hd\game-zizaijianghu\.local\material-native-i7SUeC\before-sha256.json
Get-FileHash D:\work\hd\game-zizaijianghu\.local\material-native-i7SUeC\character.json,D:\work\hd\game-zizaijianghu\.local\material-native-i7SUeC\character.json.martial.json -Algorithm SHA256
```

角色基准：2b73bc7faf2a55ffb68f46fe97d03723afcfe2cceac46dff7d6ba74040afdeda。
武学基准：0fe8c891eccc915ea4e79ddf3792cb410e75e1b507e475f8e73095940cccf5a4。

本节仅准备完成。原生焦点/背景阻断/Escape/实际点击/布局均NOT_RUN，不能用已过HTTP/VM测试抵扣。
