# 本地基础接口与运行说明

本文件定义的是自建本地存档服务，不是原版接口协议。当前实现包含健康检查、两个截图参考外观标识、单角色姓名/外观存档、只读武学参考目录、已取证武学检查点操作、显式境界训练检查点及 `client/` 静态文件服务，不代表原版创角或完整游戏已复刻。

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

测试使用系统临时目录和随机空闲端口，结束后清理，不覆盖日常存档。基础与只读目录的 9 项服务端接口测试通过；加上下方装配、卸下及双技能专项共 34 项通过：

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

此前双技能存档使用 `checkpoint`、绑定 `character` 及 `twoEquipped` 旗标；现支持文末的新格式并兼容读取旧旗标；旧单技能 `equipped` / `taskComplete` 格式保持兼容且不重写。事件任务 1/1 是检查点已知结果，不从槽位是否为空或 `twoEquipped` 倒推。持久化沿用现有原子写入与队列；重复装配为本地幂等，失败不改已存状态。

双技能一键装配阶段开发测试为 **25/25**：新增精确前后映射及任务/角色不变、双技能卸下拒绝和真实进程重启、写入失败及恢复、旧检查点不被新配置覆盖、双技能绑定冲突不重置。独立 QA 与页面点击结果另行记录，不以开发测试代替。
## 双技能指定槽卸下

对 `observed-event1-before-equip`，新增 `POST /api/martial-state/unequip-slot`，声明 `Content-Type: application/json`，正文严格为 `{"position":1}` 或 `{"position":2}`。成功返回 200 `{state:...}`，沿用 GET 武学状态结构。

仅清空指定槽，不移动另一项。此次已验证状态的 `owned` 顺序明确如下，不扩写为通用排序算法：

| 卸下后的状态 | owned 顺序 |
| --- | --- |
| 仅上勾拳留在槽 1 或槽 2 | 上勾拳、入悟剑法 |
| 仅入悟剑法留在槽 1 | 入悟剑法、上勾拳 |
| 槽 1、2 均空 | 入悟剑法、上勾拳 |

因此装配后先 1 后 2、先 2 后 1 均可得到全空；初始检查点仅上勾拳在槽 1 时卸下它，全空列表同样入悟在前。事件任务始终 1/1，角色、等级、其他槽位与资源不变。一键装配可从这些已验证卸下状态恢复入悟剑法槽 1、上勾拳槽 2。

空槽重复请求保持状态、不写文件，是本地幂等定义。`position` 为槽 3、锁槽、字符串或其他值，以及额外字段/缺少字段，均返回 400 `invalid_martial_slot`。非法 JSON 为 400 `invalid_json`，媒体类型错误为 415 `json_required`，超过 16 KiB 为 413 `body_too_large`，错误方法为 405。无检查点、角色绑定不符沿用既有错误；单技能检查点调用新端点返回 409 `martial_action_not_observed`。原有无正文 `/unequip` 契约不变，双技能仍不能调用该旧端点。

新双技能落盘字段为 `twoSlots`（长度 2）与 `ownedOrder`，保存当前准确槽位及已观测顺序。旧 `twoEquipped=false/true` 存档继续按原初始/双装配状态读取；启动、GET 不写迁移，实际改变状态的写操作才保存新格式。已有初始上勾拳→入悟剑法顺序不丢失。失败沿用相同原子写入和队列机制，不提前改变内存。

当前开发回归 **30/30 通过**，新增两种连续卸下路径、不前移及一键恢复、初始上勾拳卸空后真实重启、旧布尔档 GET 零写兼容、写失败恢复、非法槽/正文/身份与检查点拒绝。该阶段未实现手动装配；后续手动装配见末节，战斗仍未实现。

## 双技能手动装配

仅针对 `observed-event1-before-equip`，新增 `POST /api/martial-state/equip-skill`，JSON 正文严格为 `{"skillId":"uppercut-reference"}` 或 `{"skillId":"ruwu-sword-reference"}`。成功返回 200 `{state:...}`，与现有状态结构相同。

未装配技能放入当前前两槽的第一个空位，其他已装配技能保留原槽。支持已经观察的两个全空起手顺序，以及另一技能留在槽 2 时补入槽 1；因此上勾1/入悟2与入悟1/上勾2均为合法状态。仅当前两项技能范围内，`owned` 为已装配技能按槽位顺序，未装配技能按入悟、上勾固定参考顺序追加；这不是全游戏通用排序算法。

已装配的技能请求保持原状态且不写入，是本地幂等选择。编辑态点击已装配卡片应复用 `/unequip-slot` 并传实际槽位，不把本接口实现为切换装配/卸下。反序双项及仅入悟在槽 2 的存档可正常读取、指定卸下、重启；一键装配依旧恢复入悟1/上勾2。事件任务、等级、原角色与资源均不变。

未知 ID、字段缺失/额外字段、错误结构为 400 `invalid_martial_skill`；JSON/媒体类型/正文限额与其他 JSON 接口一致。单技能检查点返回 409 `martial_action_not_observed`，绑定冲突及无检查点保留原错误，失败不写档。旧布尔双技能存档依然 GET 零写兼容，初始顺序不丢失。

开发回归现为 **34/34 通过**。新增覆盖两种手动输入顺序、两方向空洞补位、反序卸下/一键恢复、重复请求不写、反序及仅入悟槽2真实进程重启、落盘失败及恢复、非法 ID/角色冲突、旧布尔档和单技能边界。独立 QA 与内部浏览器点击验收另行记录。
## 境界训练检查点

境界采用自建本地接口，不是已取得的原版协议。普通角色默认没有境界检查点，也不会自动获得江湖阅历。开启范围仅为已观察的“初入江湖、训练前120阅历、试招/站桩/拉练均0次、本境界属性10/5/1000”样本。

### 环境与启动

先按正常流程创建本地角色并停止该服务，再指定同一角色文件启动：

```powershell
$env:CHARACTER_SAVE_FILE = 'D:\work\hd\game-zizaijianghu\.local\realm-qa-character.json'
$env:REALM_CHECKPOINT = 'observed-before-training'
$env:PORT = '3006'
npm.cmd start
```

角色文件必须已存在。默认境界存档为角色文件路径追加 `.realm.json`；可使用 `REALM_SAVE_FILE` 指定独立绝对路径。境界文件不能与角色或武学文件共用路径。一次仅允许一个进程使用同一组存档。

初始化仅发生于显式配置启动且境界文件不存在时。已有境界存档不因配置重置，后续不设置 `REALM_CHECKPOINT` 仍可读取；GET 不建档或补资源。无角色、未知检查点或损坏存档会使相应初始化失败，不覆盖为新状态。角色 `{name,appearanceId}` 与武学存档保持原格式，不被训练请求改写。

### 读取与训练

`GET /api/realm-state` 返回 200 `{state:...}`。显式初始状态为：

```json
{
  "state": {
    "kind":"local-realm-checkpoint",
    "checkpoint":"observed-before-training",
    "revision":0,
    "resource":{"id":"jianghu-experience","name":"江湖阅历","amount":120},
    "realm":{
      "id":"initial-reference","name":"初入江湖",
      "progress":{"current":0,"target":30},
      "attributes":{"attack":10,"defense":5,"health":1000}
    },
    "training":[
      {"id":"trial","name":"试招","limit":10,"cost":12,"attribute":"attack","gain":2,"count":0},
      {"id":"stance","name":"站桩","limit":10,"cost":12,"attribute":"defense","gain":1,"count":0},
      {"id":"run","name":"拉练","limit":10,"cost":12,"attribute":"health","gain":100,"count":0}
    ],
    "task":{"id":"train10-reference","label":"累计修炼10次","current":0,"target":10,"completed":false}
  }
}
```

属性是本境界展示值，不是角色总战斗属性或战力。`gain` 是当前初入江湖样本的单次属性增量，不能推广到其他境界。资源名称“江湖阅历”有原版提示依据，本地 ID 为项目自定义。

`POST /api/realm-state/train` 声明 `Content-Type: application/json`，正文恰好为：

```json
{"training":"trial","expectedRevision":0}
```

`training` 仅允许 trial、stance、run，`expectedRevision` 为 GET 或前次成功响应中的非负安全整数版本号。成功返回 200 完整 `{state:...}`：扣12阅历，对应次数加1、本境界属性分别加2/1/100、累计成功修炼次数加1、revision加1。三类各以10次为上限，进度为三类次数之和，分母30。

任务固定为 `train10-reference`。累计次数落盘，显示进度最多10/10，达到10次后 completed=true；继续训练不领取奖励、不切换20次或30次任务、不推进剧情。境界接口没有突破、自然资源到账、资源补充或长按批量；独立装备检查点见后文。默认120阅历最多完成10次训练；全30次的边界测试使用明确标识的人工隔离fixture，不是游戏奖励机制。

### 事务、版本与失败

境界单个文件保存绑定角色、checkpoint、revision、experience、counts、attributes及totalTraining。训练在同一串行队列内检查状态并构造完整快照，经临时文件原子替换成功后才更新内存；阅历、次数、属性和累计任务不会跨文件各自提交。写入失败时不提前扣费、加点或增加revision。

版本号是本地并发控制契约，不是原版协议。同一 expectedRevision 的并发请求至多一个成功。成功请求再次携旧版本发送会冲突，不是再次训练。响应丢失或版本冲突时应重新 GET 核对结果，再由用户决定下一次操作，不自动重发扣费请求。

| 状态 / error | 含义 |
| --- | --- |
| 404 character_not_found | 无本地角色 |
| 404 realm_checkpoint_not_initialized | 普通角色尚未显式开启境界检查点 |
| 409 realm_checkpoint_character_mismatch | 当前姓名/外观与境界文件绑定不符；不重置或迁移进度 |
| 409 realm_revision_conflict | 请求版本不是当前版本 |
| 409 realm_training_at_limit | 对应训练已10次 |
| 409 realm_experience_insufficient | 江湖阅历不足12 |
| 400 invalid_realm_training | 训练类型、版本号或正文结构不符，包含额外/缺失字段 |
| 400 invalid_json | 无法解析 JSON |
| 415 json_required | 未声明 JSON 媒体类型 |
| 413 body_too_large | 请求超过本地16 KiB限额 |
| 405 method_not_allowed | 状态路径非GET或训练路径非POST |
| 500 local_operation_failed | 本地持久化等操作失败 |

以上拒绝不改变训练状态。版本冲突、次数上限、余额不足的本地检查顺序依次如此，不宣称原版同条件提示优先级已取证。

### 验证范围

本次服务端开发回归 **42/42通过**，其中境界8项覆盖普通角色零初始化、整笔状态事务、并发版本防重、三类上限、落盘失败恢复、真实进程重启、非法输入/绑定、损坏文件与路径冲突。独立HTTP QA **8/8通过**，详见 [境界独立QA](realm-qa.md)。

主会话已报告本轮页面范围验收通过；独立HTTP报告的页面栏记录的是该QA代理自身未执行浏览器，不能将开发或HTTP结果冒充页面证据。当前结论仅覆盖本地训练检查点，不代表完整境界成长、突破、资源获取或整款游戏完成。
## 血战刀装备检查点

本节是自建本地契约，仅复现已观察的血战刀紫色/金色替换样本。正式中文名为“血战刀”，本地 ID 中的 blade 不改变中文名称。普通角色无装备检查点，不会因创角、GET 或点击装备请求获赠物品。

### 环境与启动

先创建本地角色并停止使用该角色文件的服务，再显式启动：

```powershell
$env:CHARACTER_SAVE_FILE = 'D:\work\hd\game-zizaijianghu\.local\gear-qa-character.json'
$env:GEAR_CHECKPOINT = 'observed-event5-blade'
$env:PORT = '3007'
npm.cmd start
```

角色文件必须已存在。默认装备存档为角色文件路径追加 `.gear.json`；`GEAR_SAVE_FILE` 可指定独立路径，不能与角色、武学或境界文件同路径。一组存档仅供一个服务进程使用。

仅在装备存档不存在且显式配置检查点的启动时初始化，初始穿戴金色血战刀、revision=0。已有文件不因配置重置，后续不设置 GEAR_CHECKPOINT 也可读取；GET 不初始化或改档。未知检查点、损坏存档或初始化时无角色会启动失败，不覆盖旧数据。

### 状态与穿戴

`GET /api/gear-state` 成功返回200，初始结构如下：

```json
{
  "state": {
    "kind":"local-gear-checkpoint",
    "checkpoint":"observed-event5-blade",
    "revision":0,
    "equippedId":"bloodwar-blade-gold",
    "owned":[
      {
        "id":"bloodwar-blade-purple","name":"血战刀","tier":1,"quality":"紫色","power":1679,
        "attributes":{"attack":60,"defense":30,"health":2980,"criticalResistance":5}
      },
      {
        "id":"bloodwar-blade-gold","name":"血战刀","tier":1,"quality":"金色","power":2793,
        "attributes":{"attack":96,"defense":48,"health":4760,"criticalResistance":5}
      }
    ],
    "equipmentAttributes":{"attack":636,"defense":318,"healthText":"3.15万","criticalResistance":50}
  }
}
```

owned 固定紫色→金色，代表本样本两种可选装备，没有数量字段或库存数量承诺。item.attributes 为该件装备展示属性，criticalResistance 表示抗暴。equipmentAttributes 是其他装备贡献保持该样本背景时的装备页基础属性展示；紫色对应攻击600、防御300、气血文本2.98万、抗暴50，金色如上。healthText 保留原显示文本，不能从万值反推精确气血，也不能将其当作完整角色战斗属性或推出通用属性公式。

两个写端点均要求 `Content-Type: application/json`，字段不允许缺失或额外添加：

| 端点 | 严格正文 | 行为 |
| --- | --- | --- |
| POST /api/gear-state/equip | `{"itemId":"bloodwar-blade-purple","expectedRevision":0}` | 选择紫色；itemId也可为bloodwar-blade-gold以手动选择金色 |
| POST /api/gear-state/auto-equip | `{"expectedRevision":1}` | 此两项样本恢复金色，不代表通用最优装备算法 |

成功均返回200完整 `{state:...}`。expectedRevision 必须为读取或前次成功响应中的非负安全整数。实际切换时 equippedId 与 revision+1 一起持久化，返回对应展示属性；角色、武学和境界文件不被修改。

### 本地版本约定与失败

装备文件保存 checkpoint、绑定 character（name/appearanceId）、revision、equippedId。沿用串行队列、同目录临时文件与原子替换，替换成功才更新内存；失败不提前改穿戴状态或版本。

先检查版本再判断同一装备：当前版本选择已穿装备（包含已经穿金色时的一键装备）返回200且不写文件、不增加版本；旧版本即使选择当前装备也返回409。以上为本地并发与幂等约定，不是原版接口事实。同版本并发的两个实际替换请求最多一个提交；无状态变化的请求本身不消耗版本。

版本冲突或响应丢失时重新GET确认状态，不自动重发更换；客户端仅根据成功响应或重读更新展示。

| 状态 / error | 含义 |
| --- | --- |
| 404 character_not_found | 无本地角色 |
| 404 gear_checkpoint_not_initialized | 尚未显式初始化装备检查点 |
| 409 gear_checkpoint_character_mismatch | 当前角色姓名/外观与绑定不符，不重置装备 |
| 409 gear_revision_conflict | 版本不是当前版本 |
| 400 invalid_gear_equip | 手选ID、版本或正文结构不符 |
| 400 invalid_gear_auto_equip | 一键请求版本或正文结构不符 |
| 400 invalid_json | JSON无法解析 |
| 415 json_required | 未声明JSON媒体类型 |
| 413 body_too_large | 正文超过本地16 KiB限额 |
| 405 method_not_allowed | 状态路径非GET或穿戴路径非POST |
| 500 local_operation_failed | 本地持久化等操作失败 |

### 验证与范围

本轮全部服务端开发测试50/50通过，其中装备新增8项；独立HTTP QA 8/8通过，见 [装备独立QA](gear-qa.md)。覆盖普通角色无档、精确属性文本、手选与一键、同装备零写/旧版本冲突、并发、落盘失败恢复、真实新进程恢复、非法输入、绑定与旧存档隔离。

主会话内部浏览器已测普通无档、金色详情→紫色更换、断服失败保持展示与锁写、新进程重读紫色→一键金色、双页旧版本冲突只重读不自动再写、手动金色及刷新保留。页面由主会话执行，独立HTTP代理仅补录报告；已列路径通过，不代表全部竞态或原版视觉通过。

本检查点没有自然解锁、背包数量、战斗掉落、领取奖励、卸下、强化或熔炼；其余装备只有固定背景贡献，未实现完整装备系统。不能将显式样本接入宣称为普通角色已自然通关事件5或整款游戏完成。

## 首次突破检查点

三个端点均为自建本地契约，只承载已取证的初入江湖→九品前期一次突破。普通角色不自动达成条件；突破内的事件5条件领取不等于主线事件5任务领取。

### 启动与旧训练隔离

使用已存在的独立本地角色，且该角色的境界存档尚未建立：

```powershell
$env:CHARACTER_SAVE_FILE = 'D:\work\hd\game-zizaijianghu\.local\breakthrough-qa-character.json'
$env:REALM_CHECKPOINT = 'observed-before-first-breakthrough'
$env:PORT = '3008'
npm.cmd start
```

仍使用 REALM_SAVE_FILE，默认角色文件路径追加 `.realm.json`；不增加领奖文件。只在显式配置且无境界档时初始化。初始样本为初入江湖30/30、三类训练各10次、属性30/15/2000、领悟收益100、江湖阅历120，三项突破条件已达标但均未领取。

已有 `observed-before-training` 文件不会被新flag覆盖或自动升级，GET不迁移。要测试突破应另用隔离角色/存档路径，不删除现有训练进度。旧训练检查点请求突破端点返回404 `breakthrough_checkpoint_not_initialized`；新突破检查点请求 `/api/realm-state` 或 `/api/realm-state/train` 返回404 `realm_training_checkpoint_unavailable`。客户端据此分别开放入口。旧训练检查点的原有响应与训练行为不变，突破成功后的九品训练使用下节专用端点，不改变旧训练端点。

### 精确接口

`GET /api/breakthrough-state` 返回200，初始状态为：

```json
{
  "state": {
    "kind":"local-breakthrough-checkpoint",
    "checkpoint":"observed-before-first-breakthrough",
    "revision":0,
    "resource":{"id":"jianghu-experience","name":"江湖阅历","amount":120},
    "realm":{
      "id":"initial-reference","name":"初入江湖",
      "attributes":{"attack":30,"defense":15,"health":2000},"comprehensionGain":100
    },
    "conditions":[
      {"id":"event5","label":"通关事件5","current":1,"target":1,"claimed":false,"reward":{"id":"baodian-token-reference","name":"宝典令","amount":5}},
      {"id":"martial2","label":"装配2本武学","current":2,"target":2,"claimed":false,"reward":{"id":"baodian-token-reference","name":"宝典令","amount":5}},
      {"id":"training30","label":"境界修炼30次","current":30,"target":30,"claimed":false,"reward":{"id":"baodian-token-reference","name":"宝典令","amount":5}}
    ],
    "receipts":[],"advanced":false,"canAdvance":false
  }
}
```

`POST /api/breakthrough-state/claim` 要求JSON媒体类型，正文恰好为：

```json
{"conditionId":"event5","expectedRevision":0}
```

conditionId 仅允许 event5、martial2、training30。首次成功领取使对应 claimed=true、revision加1，并在同一存档追加一条流水：

```json
{"id":"first-breakthrough-event5","conditionId":"event5","reward":{"id":"baodian-token-reference","name":"宝典令","amount":5}}
```

另两项流水ID分别为 first-breakthrough-martial2 和 first-breakthrough-training30。receipts 按成功领取顺序保存，只表示本检查点本次新增奖励，**不表示宝典令总余额**；初始总余额未知，接口不返回余额0或总余额15。claimed由已有流水确定，页面刷新不应将历史流水重新当作一次新奖励。

三项全部领取后 canAdvance=true。`POST /api/breakthrough-state/advance` 正文恰好为：

```json
{"expectedRevision":3}
```

首次成功使revision加1、advanced=true、canAdvance=false，realm变为：

```json
{"id":"ninth-early-reference","name":"九品前期","attributes":{"attack":40,"defense":20,"health":2500},"comprehensionGain":150}
```

两个POST成功均返回200完整 `{state:...}`。三条流水与已领条件保留，突破领取/突破动作本身不扣江湖阅历；仅执行这些动作时仍为120。突破本身不追加奖励流水，不领取主线任务；后续训练见下节，下一次突破及资源来源算法仍未实现。

### 持久化、版本与错误

突破复用境界单文件与串行队列。领取流水、其所代表的条件领取状态及revision一次提交；突破状态、属性和revision一次提交。临时文件替换成功才更新内存，不跨角色、武学或装备存档多次发奖。既有realm字段保留，新增receipts与advanced；重启无需再次提供初始化flag。

expectedRevision为非负安全整数，先检查版本再处理重复动作。当前版本重复领取已领条件或重复已成功突破返回200，不写档、不加版本或奖励；旧版本一律409冲突，包括重复动作。未领齐三项不得突破。重复请求和并发处理是本地工程约定，不声称原版重复点击行为已验证。遇响应不明或版本冲突应重读，不自动再次领奖或突破。

| 状态 / error | 含义 |
| --- | --- |
| 404 character_not_found | 无本地角色 |
| 404 breakthrough_checkpoint_not_initialized | 无境界档，或当前为旧训练检查点 |
| 404 realm_training_checkpoint_unavailable | 新突破检查点调用旧训练状态/动作端点 |
| 409 realm_checkpoint_character_mismatch | 角色与境界存档绑定不符，不重绑或清档 |
| 409 realm_revision_conflict | 版本不是当前版本 |
| 409 breakthrough_conditions_unclaimed | 仍有条件奖励未领取，不能突破 |
| 400 invalid_breakthrough_claim | 条件ID、版本或正文结构不符 |
| 400 invalid_breakthrough_advance | 版本或正文结构不符 |
| 400 invalid_json | JSON无法解析 |
| 415 json_required | 未声明JSON媒体类型 |
| 413 body_too_large | 正文超过16 KiB |
| 405 method_not_allowed | 状态路径非GET或动作路径非POST |
| 500 local_operation_failed | 本地持久化等操作失败 |

### 验证范围

全部开发回归57/57通过，其中突破新增7项；独立真实HTTP QA 10/10通过，详见 [首次突破独立QA](breakthrough-qa.md)。覆盖领取/突破写失败原子性、同版本并发、防重复写、真实进程恢复、非法输入、绑定冲突、普通无档、训练/突破隔离及新flag不覆盖旧档。

主会话内部浏览器已实际通过普通角色无入口、显式检查点三项领取、断连后锁写/重启重读、双页领取及突破版本冲突只读恢复；最终revision4、三条唯一流水、江湖阅历120不变。页面证据归主会话，不能将独立HTTP代理未操作浏览器的记录当作该代理页面验收。

当前仍为显式检查点，不代表普通角色已自然完成事件5、装配2本和修炼30次；不实现主线领奖、令牌总余额、下一次突破或完整成长系统；后续已实现训练范围见下节。

## 九品前期第一重、第二重训练

复用已突破的现有境界存档，不新增检查点或资源。第二重连续证据见 [累计修炼123次与第二重训练证据](train123-evidence.md)。第三重只显示已观测到达状态，后续训练尚未实现；这不是原版禁止训练或真实上限。

`POST /api/breakthrough-state/train` 要求JSON，严格为两个字段：

```json
{"training":"trial","expectedRevision":4}
```

training允许trial（练武）、stance（聚气）、run（调息）；expectedRevision为非负安全整数。单次成本均16江湖阅历，对应攻击+2、防御+1、气血+110。成功200返回完整 `{state:...}`，realm.attributes、resource、revision和ninthTraining一起更新。GET仍用 `/api/breakthrough-state`；未突破时ninthTraining为null，已突破旧档缺该字段时仅投影第一重三项0，不在GET补写。

ninthTraining格式示例：

```json
{
  "stage":2,"stageName":"第二重","total":39,"supported":true,
  "progress":{"current":0,"target":54},
  "training":[
    {"id":"trial","name":"练武","displayTarget":53,"cost":16,"attribute":"attack","gain":2,"count":10},
    {"id":"stance","name":"聚气","displayTarget":53,"cost":16,"attribute":"defense","gain":1,"count":13},
    {"id":"run","name":"调息","displayTarget":53,"cost":16,"attribute":"health","gain":110,"count":16}
  ]
}
```

| stage | 累计total范围 | progress | supported |
| --- | --- | --- | --- |
| 1 第一重 | 0～38 | total / 39 | true |
| 2 第二重 | 39～92 | (total-39) / 54 | true |
| 3 第三重 | 93 | 0 / 66 | false |

三卡count跨重累计，不重置；displayTarget=53仅为已取证展示分母，本地未实现未经测量的单卡53上限。第39次训练自动进入第二重，除当次训练收益外，仅此已证节点追加攻击10、防御5、气血500。第93次自动进入第三重，仅增加当次训练收益，不重复第一重额外属性。不通过突破按钮升重，不授予额外资源，也不推进或领取原版累计修炼123次主线。

持久字段为 `ninthTraining:{stage,counts:{trial,stance,run}}`，计数为非负整数，stage与累计范围须符合上表；旧stage2/total39存档继续合法。原始训练counts/totalTraining与突破receipts保留。仍在侧档模式时一次替换境界侧档；已迁入schema2时同一主文件提交训练、阅历扣除和资产负流水，侧档不写。余额不足、版本冲突或落盘失败均不提交任何部分；并发同版本只有一个成功。GET及写响应均不直接返回assets，客户端另GET资产状态。

| 状态 / error | 含义 |
| --- | --- |
| 409 realm_revision_conflict | 版本不符，重读后再由用户决定动作 |
| 409 realm_breakthrough_required | 尚未完成首次突破 |
| 409 realm_training_not_observed | 已到第三重，本轮未支持后续训练 |
| 409 realm_experience_insufficient | 余额不足16，不补资源 |
| 400 invalid_ninth_training | training、版本或严格正文结构不符 |

角色不存在、检查点不匹配、绑定冲突、JSON/媒体类型/大小、HTTP方法及持久化失败沿用突破接口公共错误。普通角色不会因调用此端点自动取得境界存档。

开发回归84/84通过，第二重独立HTTP QA 8/8通过；覆盖旧stage2读取、余额不足、53/54临界失败与并发、单文件账本同步及真实新进程恢复第三重。页面验证由主会话独立执行，本段不代替其结论。

## 上勾拳Lv1→2：既有武学存档增量

本轮直接扩展现有两个武学检查点，不新增checkpoint，不改变旧装卸请求正文。普通角色无武学存档仍404，不因打开养成页取得武学或材料。正材料测试仅来自明确标识的隔离人工文件，不是生产获取流程。

### 新增状态与旧档读取

`GET /api/martial-state` 及所有成功武学写响应的state新增revision与growth；既有owned、slots、task保持，owned内上勾拳level改为真实保存等级。旧档无成长字段时投影如下，不写迁移：

```json
{
  "revision":0,
  "growth":{
    "uppercut":{
      "skillId":"uppercut-reference",
      "level":1,
      "attributes":{"attack":20,"defense":10,"health":1000},
      "material":{"id":"uppercut-material-reference","name":"上勾拳","quantity":null},
      "upgrade":{"targetLevel":2,"cost":1,"supported":true}
    }
  }
}
```

上述是state增量字段，不替换已有结构。quantity=null表示材料数量未知，不能显示为0；只有明确保存的0才表示材料不足。supported仅表示本轮支持该等级的升级，不代表材料已满足。attributes为已证当前武学展示属性，不是角色总属性或战斗公式。

持久字段为可选revision和可选 `uppercutProgress:{level,materialQuantity}`。revision存在时必须是非负安全整数；uppercutProgress存在时level只允许1或2，materialQuantity允许非负安全整数、null或缺省，缺省同样投影未知；不允许额外成长字段。非法已存数据拒绝加载，不覆盖。旧布尔槽位格式仍能只读兼容；缺revision投影0、缺成长投影已知检查点Lv1，均不在GET补写。

### 升级接口与原子性

`POST /api/martial-state/upgrade` 要求JSON媒体类型，正文严格为：

```json
{"skillId":"uppercut-reference","expectedRevision":0}
```

skillId只允许上勾拳，expectedRevision为当前非负安全整数版本。验证角色绑定和检查点后，依次检查版本、等级必须为1、材料数量已知且至少1。成功返回200完整 `{state:...}`，一次事务扣1材料、保存level2并使revision加1；角色、槽位、列表顺序和任务状态不因升级改变。

人工隔离样本Lv1、材料2成功后为Lv2、材料1；growth属性变为攻击40、防御20、气血2000，owned上勾拳level同步为2。upgrade仍保留targetLevel=2/cost=1，但supported=false；这不是Lv2→3预览或消耗承诺，不继续升3。

升级复用武学串行队列与单文件原子替换，成功落盘才更新内存；写失败不扣材料、不升级、不加版本。旧revision请求先拒绝，即使技能已Lv2；当前revision再次尝试Lv2返回范围拒绝，**升级不定义为重复成功的幂等动作**。版本冲突或结果不明应重新GET，由用户决定后续操作，不自动重发。

### 现有装卸兼容

一键装配、单技能卸下、指定槽卸下及手动装配继续原请求正文。所有实际状态变化现在使武学revision加1；重复无变化仍不写、不增版本。它们会保留uppercutProgress，不能重建槽位存档时丢失材料与等级。旧twoEquipped档在实际装卸写入时转为twoSlots/ownedOrder，保留其他成长数据；GET不转换。

装卸和升级共用队列。因此另一页装卸改变版本后，旧详情升级会冲突且不扣材料。原装卸端点本身未新增expectedRevision字段，不将这项兼容扩展说成全部旧动作已提供客户端版本校验。

只读 `/api/reference/martial-catalog` 仍是原Lv1截图参考，不因玩家升级改写；玩家养成页必须使用growth当前值，不把图鉴的Lv1属性或0/1材料展示当玩家状态。

| 状态 / error | 含义 |
| --- | --- |
| 404 character_not_found | 无本地角色 |
| 404 martial_checkpoint_not_initialized | 没有既有武学检查点 |
| 409 martial_checkpoint_character_mismatch | 角色身份与武学绑定不符 |
| 409 martial_revision_conflict | 升级请求版本不是当前版本 |
| 409 martial_upgrade_not_observed | 当前不是本轮支持升级的Lv1，例如已Lv2 |
| 409 martial_material_unknown | 材料数量未确认 |
| 409 martial_material_insufficient | 已知材料为0，不足消耗1 |
| 400 invalid_martial_upgrade | skillId、版本或正文结构不符，含额外/缺少字段 |
| 400 invalid_json | JSON无法解析 |
| 415 json_required | 未声明JSON媒体类型 |
| 413 body_too_large | 正文超过16 KiB |
| 405 method_not_allowed | 升级路径非POST |
| 500 local_operation_failed | 本地持久化等操作失败 |

### 验证与边界

全部开发回归63/63通过，升级新增6项；独立HTTP QA 10/10通过，见 [升级独立QA](martial-upgrade-qa.md)。覆盖未知/0材料、Lv2拒绝、并发只扣一次、失败原子性、装卸不丢成长、旧档只读兼容、真实重启及绑定校验。

主会话内部浏览器已通过旧档未知材料禁用升级；人工隔离Lv1材料2样本断服失败锁定、新进程重读；另一页卸下使revision1后，旧详情revision0升级冲突且只重读不扣；用户明确再次点击后升级至Lv2/材料1/revision2、属性40/20/2000；另一页一键装配至revision3仍保留成长，刷新一致。页面验收归主会话，不以HTTP测试替代。

原版材料提示已明确名称上勾拳、来源藏经阁，但本地没有材料获取、抽取、赠送或购买接口，也不因旧图0/1给生产存档写0。本轮不含Lv3、其他武学升级、升星、完整属性成长或自然任务授予。

## 本地测试购买与首日领取

用户授权测试充值直接成功。本节仅模拟支付，不连接原站支付、支付SDK或产生真实扣款。已有普通本地角色即可使用资料页“本地测试充值”，无需游戏检查点；该测试入口不表示已复刻原版事件8解锁。价格和首日展示权益来自原版取证，购买成功与分步领取的行为是本地测试合同，不描述尚未验证的原版付款/领取过程。

### 读取商品与订单

`GET /api/test-commerce` 返回200 `{state:...}`。无订单时仅投影下列状态，不建档或补余额：

```json
{
  "state": {
    "kind":"local-test-commerce",
    "revision":0,
    "product":{
      "id":"dangjian-three-day-reference","name":"荡剑式三天商品",
      "price":{"currency":"CNY","minorUnits":600},
      "day1Rewards":[
        {"id":"dangjian-skill-reference","name":"荡剑式","quantity":1},
        {"id":"baodian-token-reference","name":"宝典令","quantity":40},
        {"id":"yuanbao-reference","name":"元宝","quantity":60}
      ]
    },
    "order":null,"grants":[],"canPurchase":true,"canClaimDay1":false
  }
}
```

minorUnits为人民币分，600表示¥6。grants始终表示本次首日领取记录，此接口没有钱包总余额、可消费余额或已拥有武学字段。旧模式不会据此启用资产；显式迁为schema2后，另由下节 `/api/assets` 查询已入账的可用数量。原账号tooltip的元宝0、宝典令19不能作为本地角色初始余额。

### 测试购买

`POST /api/test-commerce/purchase` 要求JSON媒体类型，正文严格两个字段：

```json
{"productId":"dangjian-three-day-reference","requestId":"客户端本次请求标识"}
```

只支持此productId；requestId为长度1～128的字符串。首次成功返回200完整 `{state:...}`，revision=1、canPurchase=false、canClaimDay1=true、grants仍为空，order为：

```json
{
  "id":"服务端生成的UUID",
  "productId":"dangjian-three-day-reference",
  "status":"paid",
  "paymentMode":"local-test",
  "purchaseRequestId":"客户端本次请求标识",
  "day1Claimed":false
}
```

paid表示本地测试成功，必须落盘成功才响应；没有真实支付会话。该角色已有此订单时，无论原requestId或新的requestId，都返回原订单及当前完整state，不再写文件、增加版本或生成第二单。复购尚未实现，这是本地范围限制，不声称原版限购一次。请求结果不明时先GET恢复订单；页面刷新也通过服务器唯一订单防重。

### 首日领取

`POST /api/test-commerce/claim-day1` 同样要求JSON，正文严格为：

```json
{"orderId":"读取到的订单UUID","expectedRevision":1}
```

orderId为非空字符串，expectedRevision为非负安全整数。有效首次领取返回200完整state，revision=2、order.day1Claimed=true、canClaimDay1=false；三条grants一起写入。每条格式如下，reward按商品首日三项顺序分别取值：

```json
{
  "id":"订单UUID:day1:dangjian-skill-reference",
  "orderId":"订单UUID",
  "day":1,
  "reward":{"id":"dangjian-skill-reference","name":"荡剑式","quantity":1}
}
```

另两条id尾部分别为baodian-token-reference、yuanbao-reference。旧纯角色/schema1模式仅保存这些记录，不生成可用资产。schema2模式会在同一次领取事务中将宝典令40和元宝60入来源账本，详情见下节；荡剑式仍不是可用武学。领取不改写武学/境界/装备侧档，也不把境界宝典令receipts累加为总余额。购买不自动领取，首日之外无领取动作，后两日条件与权益未实现。

### 主文件兼容与事务

使用既有CHARACTER_SAVE_FILE，不新增订单sidecar或检查点。旧纯角色 `{name,appearanceId}` 正常读取，GET不迁移；尚未显式迁移的旧纯角色首次测试购买才以一次原子写变为：

```json
{
  "schemaVersion":1,
  "character":{"name":"本地角色名","appearanceId":"male-reference-0002"},
  "commerce":{
    "boundCharacter":{"name":"本地角色名","appearanceId":"male-reference-0002"},
    "revision":1,
    "order":{"id":"UUID","productId":"dangjian-three-day-reference","status":"paid","paymentMode":"local-test","purchaseRequestId":"请求标识","day1Claimed":false},
    "grants":[]
  }
}
```

`/api/character` 的请求与响应仍是原角色shape，GET返回 `{character:{name,appearanceId}}`。后续PUT保留commerce；更改姓名或外观不会删除订单或默默改绑，测试购买/领取/读取会明确返回绑定冲突。恢复原身份可继续读取原订单。损坏或无效订单/权益数据拒绝启动，不覆盖旧文件。

角色PUT、购买及领取共用同一store串行队列。写入通过同目录临时文件和原子替换，成功后才换内存；失败不会出现已付订单未落盘、部分权益发放或已领取标记单独生效。

领取依次检查角色绑定、订单存在、订单ID、版本，再判断是否已领取。当前版本重复已领取请求返回200，不写文件或增版本；旧版本即使已领取仍409。并发首次领取只有一个提交，另一个版本冲突；冲突或响应不明时只重读，不自动再领取。以上为本地可靠性约定，不是原版网络协议。

| 状态 / error | 含义 |
| --- | --- |
| 404 character_not_found | 无本地角色，不能读取或购买 |
| 409 commerce_character_mismatch | 当前角色与订单绑定不符，保留旧权益 |
| 409 commerce_order_required | 领取时尚无订单 |
| 409 commerce_order_mismatch | 请求orderId不是该角色现存订单 |
| 409 commerce_revision_conflict | 领取版本不是当前版本 |
| 400 invalid_commerce_purchase | 商品ID、requestId或正文结构不符 |
| 400 invalid_commerce_claim | orderId、版本或正文结构不符 |
| 400 invalid_json | JSON无法解析 |
| 415 json_required | 未声明JSON媒体类型 |
| 413 body_too_large | 正文超过16 KiB |
| 405 method_not_allowed | GET状态或POST动作方法不符 |
| 500 local_operation_failed | 本地持久化等操作失败，不代表真实支付结果 |

### 验证范围

本轮全部开发回归75/75通过，其中测试购买新增7项；独立真实HTTP QA 10/10通过，见 [本地测试购买独立QA](test-commerce-qa.md)。覆盖旧角色GET零迁移、购买/领取分别失败原子、并发防重、角色PUT保留权益、绑定冲突、其他存档隔离、真实新进程恢复与非法输入。

主会话已报告内部浏览器本轮范围通过，页面路径由QA补录到同一报告；本段不把独立HTTP代理写成浏览器执行者。当前完成的是普通角色可进入的本地测试订单→首日权益记录闭环，不是原版真实支付验收，也不是可消费资源、荡剑式玩法、后两日领取或正常主线解锁完成。


## 显式统一资产与境界存档（schema2）

这是本地存档整合，不代表自然主线或资源授予已经完成。旧普通角色与schema1订单仍按上节工作；购买、领取和GET均不会自动启用assets。必须停止使用目标存档的服务，显式执行一次离线迁移。新角色资源未知，不默认赠币、材料或阅历。

### 离线迁移

```powershell
node server/migrate-assets.js --character "D:/path/character.json"
node server/migrate-assets.js --character "D:/path/character.json" --realm "D:/path/character.json.realm.json"
```

以上为二选一的首次操作示例，不是顺序执行。`--character`必需，`--realm`可选；CLI参数顺序如上。角色必须已存在；选中的境界文件必须合法、绑定同一角色，且不是角色文件本身。工具不会创建检查点，也不将不同检查点拼成自然历史。迁移成功输出 `{state:资产状态}`，失败以非零退出码及错误信息结束。不要对正在运行的存档执行CLI。

选realm时保存其原始文件字节SHA-256到 `migration.realmDigest`；不选时为字符串`none`。同一来源摘要再次执行为无写入返回；摘要变化或后来追加realm均拒绝。一次迁移需要选好是否包含realm，本轮不支持向已迁移主档追加境界域。原侧档保留、不删除。迁入后应用优先使用主档内realm，不再读写该realm侧档；未迁入的境界仍使用原侧档模式。

主档外壳如下（entries、commerce及realm内部内容按实际状态保存）：

```json
{
  "schemaVersion":2,
  "character":{"name":"本地角色名","appearanceId":"male-reference-0002"},
  "commerce":null,
  "assets":{
    "boundCharacter":{"name":"本地角色名","appearanceId":"male-reference-0002"},
    "revision":0,"entries":[]
  },
  "domains":{},
  "migration":{"realmDigest":"none"}
}
```

原订单存在时保留commerce全部内容；选择realm时 `domains.realm` 原样保存所选境界状态。迁移只将已领取首日的宝典令、元宝记录分别入账一次；荡剑式继续作为commerce权益记录。选中realm的精确阅历余额作为有来源的期初记录，不从截图缩写反推数值。突破宝典令receipts、武学材料/成长、装备仍未并入资产账本。

### 读取资产

`GET /api/assets` 返回200 `{state:...}`。以下为领取过首日且迁入120阅历样本后的示意；revision以实际提交为准：

```json
{
  "state":{
    "kind":"local-assets","revision":1,
    "accounts":[
      {"id":"baodian-token-reference","name":"宝典令","total":null,"available":40},
      {"id":"yuanbao-reference","name":"元宝","total":null,"available":60},
      {"id":"jianghu-experience","name":"江湖阅历","total":120,"available":120}
    ],
    "entries":[
      {"id":"realm-import:来源SHA256","assetId":"jianghu-experience","delta":120,"source":"realm-import"},
      {"id":"订单UUID:day1:baodian-token-reference","assetId":"baodian-token-reference","delta":40,"source":"local-test-day1"},
      {"id":"订单UUID:day1:yuanbao-reference","assetId":"yuanbao-reference","delta":60,"source":"local-test-day1"}
    ]
  }
}
```

宝典令、元宝的total始终null，表示总余额未知；available仅表示已记录来源内的可用数量。无领取记录时available可为0，但不能称总余额0。阅历账户仅在选realm迁移后出现，total与available均为该本地境界精确余额。accounts由entries计算，GET不落盘。

| source | 语义 | delta |
| --- | --- | --- |
| local-test-day1 | 本地测试首日领取 | 宝典令40或元宝60，按grant ID去重 |
| realm-import | 既有本地境界余额迁入 | 迁入时精确阅历，允许0 |
| realm-training | 已实现境界修炼扣费 | 初入江湖-12，九品已支持训练-16 |

流水id用于来源去重；训练id为 `realm-training:境界提交revision`。当前没有宝典令抽取或元宝消费接口，不能把有来源可用记录说成完整经济系统。

### 事务、版本与兼容

迁入realm后，旧 `/api/realm-state` 与 `/api/breakthrough-state` 读取/动作路径及请求响应保持不变；训练的阅历扣减、属性计数和资产负流水共用角色store队列，通过主文件一次临时文件替换提交。失败时账本与境界内存均不更新，仍可用原境界revision重试。realm领取与突破也写同一主文件，但本轮不将其宝典令receipts兑换为资产。

schema2首次首日领取同一次提交commerce三条grants和两条资产正流水；重领按原commerce版本与幂等约定处理，不重复入账。旧schema1领取仍仅保存grants，随后显式迁移才导入已领取记录。角色PUT保留commerce/assets/domains；改名或改外观不自动重绑或清空资源。

assets.revision只描述资产账本变动，不是全域总revision，也不替代commerce或realm的expectedRevision。购买订单、角色PUT、无资产变化的突破领取/突破动作不会增加assets.revision；一次首日两种资产入账只增加1，训练扣费增加1，幂等无写不增加。迁移期初资产版本从0开始，导入已有首日权益会增为1。

| 状态 / error | 含义 |
| --- | --- |
| 404 character_not_found | 无本地角色 |
| 404 assets_not_initialized | 角色尚未显式迁为schema2 |
| 409 assets_character_mismatch | 当前角色与资产绑定不符，保留原数据 |
| 405 method_not_allowed | assets路径只支持GET |
| 500 local_operation_failed | 本地提交等操作失败，遵循原API错误处理 |

各写端点仍使用其原有输入、绑定与版本错误；assets没有独立写HTTP接口。旧纯角色/schema1和schema2的 `/api/character` 返回形状均不变。损坏主档或迁入realm与账本余额不一致时拒绝启动，不以读时修复覆盖文件。

本轮开发回归82/82通过，含7项统一资产测试：重复迁移、GET零写、迁入后侧档停用、并发单扣、主文件失败原子性、首日到账、绑定及真实进程恢复。页面和独立HTTP验收另由对应角色记录，开发测试不替代页面验收。
