# PLAYROOM 卓游

一个可运行的多人 Web 桌游大厅。React 18 / TypeScript / Vite / Tailwind CSS / shadcn 风格本地 Radix UI 组件 / Zustand / React Router / Framer Motion；Express / Socket.IO；MySQL 8.0 / Prisma 6；可选 Redis 房间状态与 Socket.IO adapter。

**首个完整示例是 UNO。** 五子棋、中国象棋、斗地主、德州扑克保留大厅入口和独立类型接口，明确标记「即将上线」，不包含未实现规则的假开局。默认体验模式也使用真正的 Socket.IO 服务端权威房间；只有持久化层在内存中。游戏目录使用静态 mock 数据先跑通 UI。

## 电脑重启后，如何重新打开项目

本机已经安装依赖、生成 Prisma 客户端、迁移并初始化数据库。普通重启后无需重复安装、迁移或种子初始化，保留已有 `.env`。

在 PowerShell 中运行：

```powershell
Set-Location E:\CodexWork\ZhuoYou-GPT
npm run dev
```

浏览器打开 <http://localhost:5173/lobby>，保持这个终端运行；`Ctrl+C` 停止前后端。当前 `.env` 的 `DEMO_MODE=true`，这是不依赖数据库的体验模式。

如果希望用户、聊天与战绩保存到 MySQL，改用下面的启动命令：

```powershell
Set-Location E:\CodexWork\ZhuoYou-GPT
Get-Service MySQL80
# 如果显示 Stopped，用管理员 PowerShell 启动：
# Start-Service MySQL80
npm run dev:online
```

本机已有 MySQL 8.0 服务 `MySQL80`；用户名 `root`、密码 `123456`。当前 `.env` 指向独立库 `board_game_lobby_playroom`，不要覆盖它。在这台机器上直接使用已有 MySQL；新环境的 Docker 初始化步骤见下文。也可以将 `.env` 改成 `DEMO_MODE=false`，以后只需 `npm run dev` 即可进入 MySQL 模式。

主题保存在浏览器，重启后仍保留。单机模式的实时房间在后端重启后清空，大厅会自动清除失效的返回入口；MySQL 模式会保留账号、聊天与已结束对局，进行中的手牌仍在内存中。需要保留实时牌局时配置 Redis（见第 3 节）。

生产构建的启动方式：代码更新后先运行 `npm run build`，随后 `npm start`，访问 <http://localhost:3001/lobby>。之后普通重启只需 `npm start`；生产模式同样读取 `.env`。

## 1. 安装与启动

需要 Node.js 20.19+（已在 Node.js 22 环境开发）。在项目根目录：

```powershell
npm install
# 若下载缓慢：
npm install --registry=https://mirrors.cloud.tencent.com/npm/ --offline=false

# 新环境需要复制；已有 .env 时保留它：
Copy-Item .env.example .env
npm run dev
```

打开 <http://localhost:5173/lobby>。后端 <http://localhost:3001/api/health>。Vite 将 `/api` 和 `/socket.io` 代理到后端。

`npm run dev` 默认从 `.env` 读取 `DEMO_MODE`；示例配置为 `true`，不依赖数据库，刷新可恢复座位，但**后端重启会清空体验模式的用户、房间、聊天与比赛**。创建房间 → 添加 AI → 我准备好了 → 开始游戏。另开无痕窗口/独立浏览器可作为第二位真人，通过房间码或复制邀请链接加入。同一浏览器的多个标签共用同一访客身份。

### 音乐与音效

打开 `/settings` 的「音乐与音效」。首次打开页面时点击「开启声音」，或点击/按键任意位置后开始播放，这是浏览器的自动播放限制。大厅、等待房间、资料与设置连续播放大厅曲目；进入 `/game/:roomId` 自动切换对局曲目，离开牌桌恢复大厅曲目。切换到后台暂停声音，返回后继续。

内置四首原创 Web Audio 合成循环：微光大厅、雨夜漫游、星际牌局、霓虹轨道；不依赖外部音乐服务。它们不是《bleach》或《Once Upon A Time》的歌曲录音。要播放这两首歌，在对应场景点击「导入音乐」，选择你已有的音频文件即可；支持浏览器可解码的 MP3、WAV、OGG 等格式，单文件不超过 20 MB。导入后自动选为该场景音乐，也能从下拉列表切换；「试听」播放 15 秒，「结束试听」恢复当前页面音乐。

歌曲保存在当前浏览器 IndexedDB，不上传服务器；曲目选择、音乐/音效音量、背景音乐/音效/每秒倒计时开关和静音状态保存在 localStorage。刷新、重启仍保留；更换浏览器或清除网站数据需要重新导入。大厅顶栏和牌桌工具栏都有一键静音按钮。删除正在使用的自定义曲目会恢复默认音乐，播放失败也会提示并回退默认曲目。

按钮点击、鼠标悬停手牌、初始发牌、摸牌、普通出牌、跳过、反转、+2、万能换色、+4、UNO 语音、轮到你、漏喊罚牌和胜负均有音效。所有人的回合计时每秒轻响，最后 5 秒使用更明显的提示。点击 UNO 只记录声明；声明后的倒数第二张牌出牌成功时才播放 UNO 语音，AI 的合法 UNO 出牌也相同。UNO 使用本地 `client/public/audio/uno.wav` 合成语音，播放时压低音乐；加载失败可回退浏览器语音。

牌局声音根据服务端公开日志的类型事件触发，覆盖真人和 AI 的动作；无隐藏手牌信息。客户端按唯一日志 ID 去重，聊天更新不重复出牌声音，断线重连和历史快照不补播旧动作。日志保留最近 60 条并使用独立单调序号，避免同一回合多次动作产生重复 ID。此更新不需要安装新依赖或进行数据库迁移。

## 2. MySQL 联机模式

```powershell
docker compose up -d mysql
Copy-Item .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:online
```

示例连接：

```dotenv
DATABASE_URL="mysql://root:123456@localhost:3306/board_game_lobby"
```

Compose 使用 **MySQL 8.0**，服务端字符集 `utf8mb4`、排序规则 `utf8mb4_unicode_ci`。所有初始迁移表同样显式设置该字符集与排序规则。没有 SQLite 或 PostgreSQL。

**已有本地 MySQL 可以直接使用，无须 Docker。** 如果 3306 被本机 MySQL 占用，请使用该实例或调整 Compose 映射端口和 URL，不要同时争用端口。迁移应指向全新空库。若已有同名库和另一套 Prisma 迁移，改用新库，禁止 reset/drop。当前开发机器原有 `board_game_lobby` 已有数据结构，因此生成的本机 `.env` 指向独立库 `board_game_lobby_playroom`，保留原库；`.env.example` 保留标准库名。不要用 Copy-Item 覆盖你已配置好的本机 `.env`。

```sql
CREATE DATABASE IF NOT EXISTS board_game_lobby_playroom
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Prisma schema 包含 `User`、`Game`、`Room`、`RoomPlayer`、`Match`、`MatchPlayer`、`ChatMessage`、`Friend`、`Ranking`。种子数据仅建立五款游戏，不虚构战绩。访客身份首次进入大厅自动创建，凭证哈希保存于数据库，本机保存随机 token。

- 创建房间：事务创建 Room 和房主 RoomPlayer。
- 加入房间：事务锁定 Room 行，校验容量，唯一索引限制座位。
- 对局结束：事务写 Match / MatchPlayer，更新金币、等级与 Ranking；用 matchId 和房间行锁防止重复奖励。
- 金币扣减：预留 `debitCoins()`，通过条件更新和事务防止负余额；当前房间免费，不扣金币。
- 聊天：每条持久化，房间投影只保留最近 100 条。
- 单次出牌**不写 MySQL**；仅更新实时存储。单机房间存在进程内存，MySQL 保留房间元数据，单机进程重启不恢复未结束牌局。

新增 schema 变化用 `npm run db:migrate:dev -- --name <名称>`；部署已提交迁移用 `npm run db:migrate`。

## 3. Redis 多实例

```powershell
docker compose --profile cluster up -d mysql redis
```

所有进程使用相同数据库，并设置：

```dotenv
DEMO_MODE=false
REDIS_URL=redis://localhost:6379
```

房间完整状态、私人手牌、准备状态、聊天尾部、回合截止时间与 AI 下一步时间保存在 Redis。`@socket.io/redis-adapter` 转发跨节点事件；adapter 本身不存储房间状态。变更持有带续租、令牌校验释放的 Redis 锁；每个进程运行调度器，在房间锁内再次检查时间，因此不会重复 AI 出牌。房间 revision 拒绝旧动作。结果写入失败保留待保存标记，调度器重试，奖励仍保证一次。

客户端和服务端都明确使用 **WebSocket transport**；反向代理需要转发 Upgrade。若以后启用 HTTP long-polling，还需要粘性会话。Redis adapter 不支持内建 connectionStateRecovery，因此本项目用访客 token + `room:sync` 主动恢复最新状态，不依赖 adapter 的 packet recovery。

```powershell
# 在两个终端运行，例如：
$env:PORT=3001; npm run dev:server
$env:PORT=3002; npm run dev:server
```

生产环境使用同源反向代理，或设置 `CLIENT_ORIGIN` 和构建时的 `VITE_SERVER_URL`。Redis 仅放内网，并按部署环境配置认证；访客登录是示例身份流程。

## 4. 页面与操作

| 路由 | 功能 |
| --- | --- |
| `/lobby` | 五款游戏入口、名称搜索、分类/人数/模式筛选、排序、实时房间列表、创建/加入、好友抽屉 |
| `/room/:roomId` | 房间码、复制邀请、座位、准备、AI 添加/移除、难度选择、规则、聊天、房主开局 |
| `/game/:roomId` | 一屏沉浸牌桌、四向玩家席位、最近两位玩家出牌、席位倒计时、牌堆/匹配提示、扇形手牌、选择/拖拽出牌、独立 UNO 按钮、摸牌高亮、万能牌选色、动态/聊天抽屉、结果和再来一局 |
| `/profile` | 玩家 ID、金币/等级、最近 20 局、排行榜、复制好友 ID |
| `/settings` | 八套颜色主题（含三套渐变）、修改昵称、减少动画、运行模式与连接说明 |

好友列表持久化为单向关注关系，可用玩家 ID 添加。好友房间邀请通过复制可直接打开的链接完成，无伪造「发送成功」。社交抽屉默认收起；移动端导航和筛选折叠。聊天 React 文本渲染，不解释 HTML。

在设置选择「夜色青柠 / 极光蓝 / 星云紫 / 落日珊瑚 / 鎏金琥珀 / 霓虹星河 / 暮光落日 / 流光海湾」。后三套是渐变主题，整体背景、面板、主视觉与牌桌同时渐变；按钮和光效同步换色，自动保存在本设备。配色方向参考 [uiGradients](https://github.com/ghosh/uiGradients/blob/main/gradients.json) 的蓝紫、日落与海湾色系，实际配色针对暗色牌桌重新设计。UNO 卡牌本身的红黄绿蓝不随主题变化，保持规则辨识。移动端可从导航抽屉进入「主题与设置」，牌桌上也有主题设置入口。

点击 Logo 或「桌游大厅」只切换页面，保留原房间座位。在大厅、资料或设置顶部显示「回到房间」；刷新和断网重连时通过 `room:current` 查询服务端，恢复入口。旁边叉号执行真正的 `room:leave`，确认成功才关闭入口，可以随后新建房间；对局中离开时由 AI 接管剩余手牌。

UNO 对局去除大厅页眉、页脚、面包屑和营销标题，牌桌占满当前视口，手牌和操作按钮放在牌桌底部，桌面/手机/较矮横屏都无需滚动页面。四人局相对当前玩家按下、左、上、右入座，自己的名片固定在底部手牌区左侧；2–6 人使用相应席位布局。手牌按万能牌、红、黄、绿、蓝分组，同色按牌值排序，不改变服务端牌序。手机按可用宽度压缩扇形间距，手牌非常多时仍可横向滚动。计时器只显示在当前行动玩家席位，换人时随之移动。动态与聊天默认关闭，点击顶部按钮展开抽屉，关闭或按 Esc 收起。

各玩家席位旁只保留最近两位不同玩家打出的公开卡牌。第三位出牌后移除最早的一位，同一玩家再次出牌时覆盖自己的卡牌并更新顺序，摸牌或 pass 不清除。中央另展示最近 7 张已公开弃牌的错落牌堆，顶牌就是当前匹配牌；两条金色箭头表示顺时针/逆时针出牌顺序，反转牌实时翻转箭头。摸牌堆移至左上角，余量显示在牌背上。公开记录由服务端保存并同步，刷新和观战可恢复，重新开局清空，不暴露对手手牌。

每位玩家剩余数量用等数量的重叠牌背表示，前面的牌背标注总张数；左右玩家牌背在名片下方，上方玩家牌背在名片右方，自己的数量在手牌区左侧。禁止牌会给被跳过玩家的头像和牌背区加红色禁止符号，自己的手牌区也有大号标记；标记保留至该玩家下一次可以行动，刷新后仍恢复。该标记仅表示公开的跳过结果，合法动作仍由服务端规则校验。

拖拽手牌使用挂载在页面顶层的浮层，离开滚动手牌区后仍跟随指针显示；上拖释放或点击出牌，服务端确认后飞向中央弃牌堆，万能牌仍需选色。鼠标、触摸和关闭动画时的拖拽都保留。摸牌、+2/+4 和漏喊罚摸均按实际摸到的数量逐张从左上牌堆飞向玩家手牌区，带方向拖尾，每张间隔 520ms，入手后翻为自己的牌面；对手始终只显示牌背。音效随每张摸牌依次播放，重连历史不补播动画，关闭动效立即显示最新手牌。

「UNO!」是独立操作按钮，只有轮到自己且手牌恰好两张时可点击。`game:action { type: 'uno' }` 由服务端验证并保存声明，不消耗回合，也不重置计时；声明在本回合出牌时有效，摸牌、回合变化与重新开局清除。点击后刷新页面仍能恢复。没有合法出牌、需要摸牌时，「摸一张」按钮发光高亮。

## 5. UNO 示例规则 / AI

实现标准 108 张牌、7 张起手、颜色/数值匹配、跳过、反转、+2、万能变色、+4（有当前色时不允许使用）、摸牌与结束回合、牌堆耗尽重洗、清空手牌获胜。已核对 [Mattel 官方 UNO 规则](https://shop.mattel.com/pages/games-uno-braille-rules) 与 [官方移动版说明](https://pre-letsplayuno.mattel163.com/news/guide/20181213/30092_732580.html)：打出倒数第二张前喊 UNO，漏喊被其他玩家抓到罚摸 **2 张**。本大厅沿用该罚牌数量，但**自动判罚漏喊**，不实现抓漏喊的时限窗口；不叠加罚牌，不实现 +4 挑战或抢喊 UNO。两人反转相当于跳过。摸到可出的牌时只可打出刚摸到的一张或 pass。回合 45 秒，超时中等策略代打；断线后临时代打，重连恢复自己手牌；主动离开后保留该手牌由 AI 完成本局，并让出房主身份。

`GameDefinition<State, Action, View>`：`id/name/minPlayers/maxPlayers/createState/applyAction/getLegalActions/aiMove/getView`。UNO 独立实现；其他四款独立目录提供后续动作与状态契约，启用新游戏时同时接入服务端规则分发与桌面渲染。

AI 每次动作由服务端设置 2000–3000ms 思考时间，包括 AI 摸牌后继续出牌，以及断线玩家的 AI 接管；调度器在时间到达后执行。简单随机合法动作；中等根据手牌颜色数量、效果牌和下一位公共手牌数量评分；困难档是明确预留，当前回退中等策略。AI 函数只接受 `UnoView`，没有牌堆顺序和对手手牌。观战者手牌数组为空。

卡牌 2.5:3.5，扇形排列，悬停上浮 8px + rotateX/rotateY，选中放大 1.15 倍；普通灰边、稀有蓝边、史诗紫色粒子、传说金色呼吸光；发牌翻转与出牌拖尾。封面为本地 CSS/SVG 图形，无外部图片或字体依赖。支持系统减少动画偏好和设置页面动画开关。

## 6. 开发顺序与目录

1. Vite / 路由 / UI / mock 游戏目录。
2. MySQL schema / Compose / 初始迁移 / 五款游戏 seed。
3. Socket.IO 房间生命周期、私有视图、聊天、权限和事务。
4. 独立 UNO GameDefinition。
5. 可见信息 AI、回合计时和延迟。
6. 卡牌/桌面动画、移动端与减少动画。
7. 重连、自动代打、结果幂等与验收测试。

```text
client/
  src/
    components/         # Layout, GameArt, PlayingCard, Chat, RoomDialogs, ui/*
    pages/              # Lobby, Room, GameTable, Profile, Settings
    stores/app.ts       # Zustand 用户、连接、房间和消息
    lib/                # api, useRoom, utils
    styles.css          # 视觉系统、卡牌动效、响应式
  public/favicon.svg
server/src/
  config.ts
  index.ts              # Express、Socket.IO、静态构建、调度器
  realtime/socket.ts    # 事件注册和 Zod 运行时校验
  services/
    database.ts         # MySQL 持久化、事务 / mock 存储
    rooms.ts            # 权威房间服务、AI、隐私投影
    store.ts            # MemoryStore / RedisStore
shared/
  types.ts
  catalog.ts
  games/
    definition.ts
    uno/index.ts        # 完整 UNO 规则和公平 AI
    gomoku/index.ts
    xiangqi/index.ts
    doudizhu/index.ts
    holdem/index.ts
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  uno.test.ts
  rooms.test.ts
  e2e/lobby.spec.ts
```

## 7. 实时事件

| 客户端 → 服务端 | 功能 |
| --- | --- |
| `room:create` | RoomOptions → 私有 RoomView |
| `room:join` | 房间码，可指定观战 |
| `room:sync` | 验证成员身份，刷新/断线后重投影 |
| `room:leave` | 等待时退出，进行中 AI 接管 |
| `room:ready` | 设置自己的准备状态 |
| `room:ai` | 房主添加/移除 AI、指定难度 |
| `room:start` | 房主开局，人数与准备校验 |
| `room:rematch` | 结果保存后重置房间 |
| `game:action` | 仅提交动作和 revision，服务端规则校验 |
| `room:chat` | 成员聊天，500 字与频率限制 |

服务端：`room:state` / `game:state` 每位玩家独立私有视图；`lobby:update` 房间摘要；`presence:update` 在线玩家；`server:error` 异常提示。所有请求 ack 为 `Result<T>`，有超时与失败提示。用户不能用动作参数冒充其他玩家。

## 8. 检查与构建

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run verify:online
npm run build
npm run verify:production
npm start
```

浏览器测试使用本机 Microsoft Edge，无须额外下载浏览器。如果没有 Edge，可在 playwright.config.ts 移除 `channel`，并运行 `npx playwright install chromium`。

`verify:online` 需要完成 MySQL 迁移，自动在 3099 启动临时后端，以真实 Socket.IO 客户端运行双真人完整对局并验证数据库结果。仅删除本次生成 UUID 的验收用户与房间，不修改原有记录。

构建后 Express 提供 SPA 和 Socket.IO，打开 <http://localhost:3001/lobby>。仍需根据 `.env` 选择 demo 或在线数据库。开发客户端另一个设备访问时，改 `CLIENT_ORIGIN` 为该访问来源并重启后端；邀请链接使用当前浏览器 origin。

验证结果见 [验收记录](./VERIFICATION.md)。

部署细节参考 [Socket.IO Redis adapter 官方文档](https://socket.io/docs/v4/redis-adapter/) 与 [Prisma MySQL connector 官方文档](https://www.prisma.io/docs/orm/overview/databases/mysql)。项目锁定 Prisma 6.19，避免跨主版本配置变化。
