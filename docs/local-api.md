# 本地基础接口与运行说明

本文件定义的是自建本地存档服务，不是原版接口协议。当前实现包含健康检查、两个截图参考外观标识、单角色姓名/外观存档、只读武学参考目录及 `client/` 静态文件服务，不代表原版创角或完整游戏已复刻。

## 运行

要求 Node.js 22 或更高版本，无第三方运行或测试依赖。

```powershell
cd D:\work\hd\game-zizaijianghu
npm.cmd start
```

默认地址为 `http://127.0.0.1:3000`，仅监听本机。首页来自 `client/index.html`；目录不存在或文件未提供时返回 404，不生成假页面。可用环境变量隔离端口与存档：

```powershell
$env:PORT = '3100'
$env:CHARACTER_SAVE_FILE = 'D:\work\hd\game-zizaijianghu\.local\qa-character.json'
npm.cmd start
```

`PORT=0` 可由系统分配空闲端口，实际地址在启动输出中显示。默认存档是项目 `.local/character.json`，该目录已有 Git 忽略规则。自定义路径应使用绝对路径并放在不提交的本地目录；测试或运行不需要任何原站凭据。

单个存档文件仅允许一个服务进程使用；并发多进程共享、账号体系、多角色、多服及迁移尚未实现。

## 契约

响应为 JSON；接口不使用原版账号或认证地址。页面使用相对 `/api/...` 地址保持同源。

| 方法与路径 | 成功结果 | 说明 |
| --- | --- | --- |
| GET /api/health | 200 `{"status":"ok","scope":"local-foundation"}` | 本地服务已启动 |
| GET /api/appearance-options | 200 `{"options":[...]}` | 两个截图参考标识，见下文 |
| GET /api/character | 200 `{"character":{"name":"…","appearanceId":"…"}}` | 读取当前单角色存档 |
| PUT /api/character | 200 `{"character":{"name":"…","appearanceId":"…"}}` | 创建或完整替换本地角色，重复相同请求得到相同结果 |

没有存档时，GET /api/character 返回 404 `{"error":"character_not_found"}`。PUT 必须使用 `Content-Type: application/json`，正文直接为：

```json
{
  "name": "江湖旅人",
  "appearanceId": "male-reference-0002"
}
```

示例姓名不是默认姓名，不来自原版生成规则。`name` 仅要求是 JSON 字符串，原样保留空格、中文等内容；不实现原版长度、字符、重名、敏感词或随机生成规则，也不把本地接受空字符串推断为原版允许空名。

`appearanceId` 只接受以下两个本地标识：

```json
{
  "options": [
    {"id":"male-reference-0002","label":"男角色参考外观","evidence":"EVD-0002"},
    {"id":"female-reference-0003","label":"女角色参考外观","evidence":"EVD-0003"}
  ]
}
```

它们各自代表证据截图中的整套参考形象，不代表已还原发型/服饰组合、原版资源 ID、默认选项或全部外观数量。相关证据边界见 `character-creation-spec.md`。

## 本地失败行为

| 状态 | error | 条件 |
| --- | --- | --- |
| 400 | invalid_json | 无法解析 JSON |
| 400 | invalid_character_shape | 正文不是恰好包含 name 字符串和已列 appearanceId 的对象 |
| 400 | invalid_path | URL 百分号编码无效 |
| 413 | body_too_large | 正文超过 16 KiB；这是本地传输上限，不是原版姓名规则 |
| 415 | json_required | PUT 未声明 JSON 媒体类型 |
| 405 | method_not_allowed | 角色路径不支持的方法，或静态路径的非 GET/HEAD 方法 |
| 404 | not_found | 未知 API、缺失文件或拒绝的静态路径 |
| 500 | local_operation_failed | 本地读写等操作失败 |

请求结构校验仅在 HTTP 入口执行；未通过的请求不修改内存和存档。落盘在同目录写入临时文件后替换目标，成功后才更新内存并返回 200；失败保留最后成功的内存状态。现有存档损坏时启动失败，不覆盖为新角色。该方案不承诺断电后的硬件级持久性。

静态服务仅提供 `client/` 内真实文件，检查解码后的路径及真实路径，拒绝目录穿越以及指向目录外的符号链接/Windows junction；不会提供仓库文档、服务端源码或 `.local/` 数据。

## 验证

```powershell
npm.cmd test
```

测试使用系统临时目录和随机空闲端口，结束后清理，不覆盖日常存档。基础与只读目录的 9 项服务端接口测试通过；加上下方装配、卸下及双技能专项共 25 项通过：

1. 健康检查、参考选项、无角色 404、保存/读取、重复保存和姓名原样保留。
2. 无效结构、未知选项、非法 JSON、错误媒体类型、超限正文、不支持方法均不改变已存状态。
3. 写入失败保留最后成功状态，解除故障后可继续保存。
4. 停止首个 Node 进程，再启动全新进程，读取同一存档。
5. 同源静态文件可读；原始/编码路径穿越及目录外 junction 被拒绝。
6. 损坏的已有存档拒绝启动且内容不被覆盖。
7. 真实 HTTP 请求把中文 UTF-8 字节拆分发送，姓名仍准确保存。
8. 武学参考目录在无角色时可读取，展示字段与已核实证据一致，不创建存档。
9. 读取目录及拒绝写入请求后，已有角色存档逐字节不变。

这些是本地基础接口测试。内部浏览器页面点击、原版画面对照、原版角色持久化与完整游戏系统验收由独立 QA 另行执行，不能据此标为通过。当前不含充值档位、订单、战斗、任务奖励或任何原站连接。
## 只读武学参考目录

`GET /api/reference/martial-catalog` 返回 200，非 GET 方法返回 405 `{"error":"method_not_allowed"}`。不要求角色已创建，不读取或修改角色武学，不新增存档字段，也不为已有角色迁移或补充默认值。

```json
{
  "kind": "reference-catalog",
  "evidence": [
    "docs/evidence/original-martial-list.jpg",
    "docs/evidence/original-martial-detail.jpg"
  ],
  "observedSlots": [
    {"position":1,"visibleState":"plus-alert"},
    {"position":2,"visibleState":"plus-alert"},
    {"position":3,"visibleState":"plus-alert"},
    {"position":4,"visibleState":"locked"},
    {"position":5,"visibleState":"locked"},
    {"position":6,"visibleState":"locked"}
  ],
  "entries": [{
    "id":"uppercut-reference",
    "name":"上勾拳",
    "categoryText":"通用",
    "levelText":"1",
    "starsText":"0星",
    "roleText":"控制",
    "cooldownText":"7.3秒",
    "descriptionFragments":[
      "施展上勾拳","对选中目标造成","自身攻击力90%(27)",
      "并对范围内目标（最多3人）造成30%伤害",
      "且此技能对击中目标造成击飞效果"
    ],
    "descriptionComplete":false,
    "attributes":[
      {"label":"攻击","text":"20+20"},
      {"label":"防御","text":"10+10"},
      {"label":"气血","text":"1000+1000"}
    ],
    "observedTalentRows":[
      {"levelText":"Lv.25","visibleState":"locked","readableText":"武学属性提升+0.5%","textComplete":true},
      {"levelText":"Lv.50","visibleState":"locked","readableText":"攻击增加+200","textComplete":false},
      {"levelText":"Lv.75","visibleState":"locked","readableText":"攻击增加+400","textComplete":false}
    ],
    "upgradeCounterText":"0/1"
  }]
}
```

`uppercut-reference` 是本地参考编号，不是原版技能 ID。`observedSlots` 表示采样截图中 6 个位置的可见状态，不能据此给新角色解锁前三槽或锁定后三槽。entries 的单项也不等于本地角色已拥有该技能或游戏只有该技能。

所有 `Text`、属性和说明片段仅供展示：`90%(27)` 不参与伤害计算，`7.3秒` 不作为运行时冷却，绿色加号数值不解释为升级结果，`0/1` 不解释为已知道具消耗。说明裁切和天赋行未核清部分用完整性标记保留未知，不补写推测文案。证据范围见 `martial-evidence.md`。

目录本身仍只读，不得被当成可写玩家状态。独立装配检查点接口见下节；槽 1 卸下接口见末节；升级、升星及技能施放尚未实现。
## 已观测装配前检查点与一键装配

此功能是明确启用的开发测试检查点，输入依据为 `original-martial-task-before-equip.jpg`、`original-martial-list.jpg`，装配结果依据为 `original-martial-equipped.jpg` 和 `original-martial-task-after-equip.jpg`。它不代表普通新建角色默认拥有上勾拳，也不补齐取得该技能之前的剧情、资源或奖励。

### 开启方式

1. 用正常本地服务创建一个角色，确认 `CHARACTER_SAVE_FILE` 文件已存在，然后停止该服务。
2. 为同一角色文件设置以下配置并重新启动；一次只允许一个服务进程使用这些存档。

```powershell
$env:CHARACTER_SAVE_FILE = 'D:\work\hd\game-zizaijianghu\.local\equip-qa-character.json'
$env:MARTIAL_CHECKPOINT = 'observed-before-equip'
npm.cmd start
```

角色文件须先由正常角色流程创建。启动时仅在武学文件尚不存在时初始化检查点；无角色则启动失败。GET 不初始化、不写档。已存在的武学文件永不因该配置自动重置；损坏文件启动失败且不覆盖。

武学独立存档默认路径为 `${CHARACTER_SAVE_FILE}.martial.json`，例如上例的 `.local/equip-qa-character.json.martial.json`。可用 `MARTIAL_SAVE_FILE` 指定其他绝对路径，但不得与角色存档使用同一文件。角色文件结构仍为 `{name,appearanceId}`，不迁移、不改写、不丢弃既有数据。

初始化一次后，即使移除 `MARTIAL_CHECKPOINT` 配置，后续启动仍读取已有武学存档。要测试全新的装配前状态，请使用另一组隔离存档文件并先创建对应角色，不删除或重置现有进度。

### 接口与状态

`GET /api/martial-state` 返回 200：

```json
{
  "state": {
    "kind": "local-martial-checkpoint",
    "checkpoint": "observed-before-equip",
    "owned": [{"id":"uppercut-reference","level":1}],
    "slots": [
      {"position":1,"skillId":null,"locked":false},
      {"position":2,"skillId":null,"locked":false},
      {"position":3,"skillId":null,"locked":false},
      {"position":4,"skillId":null,"locked":true},
      {"position":5,"skillId":null,"locked":true},
      {"position":6,"skillId":null,"locked":true}
    ],
    "task":{"id":"equip-martial-reference","label":"装配武学","current":0,"target":1}
  }
}
```

`POST /api/martial-state/auto-equip` **不带正文**，成功返回同样的 `{state:...}` 结构，仅第 1 槽的 `skillId` 变为 `uppercut-reference`、任务 `current` 变为 1；其余槽位、唯一拥有技能及等级不变。不产生奖励，不改变姓名、外观或资源。

重复 POST 在本地定义为幂等，返回同一已完成状态，不再次改写存档。这是自建接口性质，原版重复点击效果未据此宣称已验证。接口不接受指定槽位、换位、卸下、升级或战斗参数。

| 响应 | 条件与客户端处理 |
| --- | --- |
| 404 `character_not_found` | 尚无本地角色 |
| 404 `martial_checkpoint_not_initialized` | 有角色但未开启检查点；页面继续提供只读图鉴，不给角色添加武学 |
| 409 `martial_checkpoint_character_mismatch` | 当前姓名/外观与检查点绑定身份不一致；展示冲突，不静默重置或迁移 |
| 400 `empty_body_required` | 装配 POST 携带正文，包括 `{}` |
| 405 `method_not_allowed` | GET 状态路径或 POST 操作路径使用了其他方法 |
| 500 `local_operation_failed` | 写入失败，内存仍保持最后成功状态 |

武学存档保存绑定角色身份和独立的 `equipped`、`taskComplete` 旗标。任务完成不从当前槽位是否有技能倒推；新增原版卸下证据表明任务仍为 1/1。槽 1 卸下接口现已实现，见末节。

### 装配专项验证

装配阶段的 7 项专项通过（加入卸下后总计 20/20），覆盖：普通角色不自动建档；明确检查点到槽 1 与任务 1/1 的迁移及并发重复请求幂等；正文错误/磁盘失败不改状态及重试恢复；身份变化返回冲突且不改武学进度；真实进程重启恢复；缺角色/未知检查点/损坏存档不覆盖；独立任务旗标不随空槽消失。

本地重启通过只证明本地持久化，不等于已证明原版装配重登行为。页面点击及原版视觉对照仍由独立 QA 另行验证。
## 槽 1 卸下

`POST /api/martial-state/unequip` 不带正文，返回 200 `{state:...}`，结构与 GET 武学状态一致。只将槽 1 的上勾拳卸下：`skillId` 变为 null，独立存档 `equipped` 变为 false，`taskComplete` 保持既有值。已装配完成任务后卸下，任务仍为 1/1；不能由空槽反推为 0/1。拥有技能、等级、其他槽位、姓名与外观均不变化。

范围依据为 `original-martial-edit.jpg`、`original-martial-unequipped.jpg`、`original-martial-task-after-unequip.jpg` 以及主代理实际点击编辑后槽 1 红叉的观察。本地接口不接受槽位参数，不实现其他槽位的卸下、换位或排序。

未装配时重复调用保持当前状态且不写入，首次装配前任务仍为 0/1；这是自建接口幂等行为，不宣称原版空槽操作已验证。非空正文（包括 `{}`）返回 400；方法错误返回 405；未启检查点/无角色返回既有 404；角色绑定不符返回既有 409。原子落盘失败返回 500，内存和任务旗标不提前改变，不重新初始化检查点。

实现与一键装配共用存档队列、身份检查及原子写入机制，未新增重复入口校验。新增 4 项测试使 `npm.cmd test` 达到 20/20：

1. 装配→卸下→真实进程重启后空槽保留，任务仍完成，原角色文件不改。
2. 卸下落盘失败后内存仍已装配、任务仍完成，原存档备份及角色文件不变，恢复后重试成功。
3. 首次装配前重复卸下不改变任务；非法正文、错误方法、绑定冲突不改存档。
4. 普通角色不能通过卸下隐式创建检查点。
## 事件 1 后双技能装配检查点

新增显式 `MARTIAL_CHECKPOINT=observed-event1-before-equip`。使用一组独立存档并先创建本地角色，初始化方法与前述检查点相同。若指定的武学文件已存在，按其原有检查点读取，绝不因新配置覆盖或迁移旧进度。普通未启检查点角色行为不变。

此起点仅承载 `event1-evidence.md` 末节已经观察到的结果，不实现事件 1 战斗、自动判胜、收益结算或发奖，不表示所有新角色已通关事件。

沿用 GET /api/martial-state、POST /api/martial-state/auto-equip（无正文），响应仍为 `{state:...}`：

| 字段 | 初始化时 | 本地一键装配成功后 |
| --- | --- | --- |
| checkpoint | observed-event1-before-equip | 不变 |
| owned 顺序 | uppercut-reference、ruwu-sword-reference，level 均为 1 | ruwu-sword-reference、uppercut-reference，level 均为 1 |
| slots[0].skillId | uppercut-reference | ruwu-sword-reference |
| slots[1].skillId | null | uppercut-reference |
| 槽 3 | 空且未锁 | 不变 |
| 槽 4～6 | 空且锁定 | 不变 |
| task | `{"id":"event1-reference","label":"通关江湖事件1","current":1,"target":1}` | 原样保留 |

`ruwu-sword-reference` 是入悟剑法的本地参考 ID。该技能未加入仅有上勾拳的详情图鉴，不补冷却、星级或养成数值。装配为这一固定输入的确切映射，不推演通用排序算法；拥有顺序与槽位顺序均以成功响应为准。

该检查点的 POST /api/martial-state/unequip 返回 409 `{"error":"martial_action_not_observed"}`，装配前后均不写入。既有身份不匹配错误仍优先返回。此限制不改变单技能检查点已实现的卸下行为。

双技能存档使用 `checkpoint`、绑定 `character` 及 `twoEquipped` 旗标；旧单技能 `equipped` / `taskComplete` 格式保持兼容且不重写。事件任务 1/1 是检查点已知结果，不从槽位是否为空或 `twoEquipped` 倒推。持久化沿用现有原子写入与队列；重复装配为本地幂等，失败不改已存状态。

服务端开发测试当前为 **25/25**：新增精确前后映射及任务/角色不变、双技能卸下拒绝和真实进程重启、写入失败及恢复、旧检查点不被新配置覆盖、双技能绑定冲突不重置。独立 QA 与页面点击结果另行记录，不以开发测试代替。