# PLAYROOM 卓游

一个可运行的多人 Web 桌游大厅。React 18 / TypeScript / Vite / Tailwind CSS / shadcn 风格本地 Radix UI 组件 / Zustand / React Router / Framer Motion；Express / Socket.IO；MySQL 8.0 / Prisma 6；可选 Redis 房间状态与 Socket.IO adapter。

**UNO、五子棋、中国象棋和斗地主现已开放。** 四款游戏复用大厅、用户、房间、聊天、观战、重连与结算系统；中国象棋包含标准对局和经典杀法教学残局，斗地主支持三人叫分和地主/农民阵营结算。德州扑克、炸弹猫、麻将、台球为预留入口，仅展示独立封面、人数和预计时长；标记“敬请期待”，不开放创建房间或实际对局。默认体验模式也使用真正的 Socket.IO 服务端权威房间；只有持久化层在内存中。游戏目录使用静态 mock 数据先跑通 UI。

UNO 与斗地主手牌按照牌桌中线居中，自己的名片保留在左侧。斗地主悬停仅描边高亮，不抬升卡牌、不改变层级；点击后才抬起表示选中。手机横竖屏保留手牌溢出滚动。麻将预留四人规则，具体地区玩法待确定；台球预留两人玩法，并新增“休闲运动”分类。新预留项目尚无 AI，因此不出现在“支持人机”筛选中。

## 电脑重启后，如何重新打开项目

本机已经安装依赖、生成 Prisma 客户端、迁移并初始化数据库，包括五子棋平局迁移。普通重启后无需重复安装、迁移或种子初始化，保留已有 `.env`。其他已部署环境更新本次代码后，需要先执行一次 `npm run db:generate` 和 `npm run db:migrate`。

本次斗地主、性能条、UNO 音效及三个预留入口更新无需新增依赖或数据库迁移。已有部署更新代码后运行一次 `npm run db:seed`，将斗地主目录标记为开放并补齐八款游戏元数据；生产部署再执行 `npm run build`。本机已执行种子更新。

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

UNO 反转使用往返扫频和转向风声；万能变色使用四音阶与闪光音；+2 / +4 出牌成功时加入本地小丑“哈哈”语音和短回声。选牌、声明 UNO、摸罚牌不会触发小丑笑声。音效均经过同一音量/静音总线，静音会取消已排队的音频。音源说明见 `client/public/audio/README.md`，可选再生成脚本仅用于 Windows 开发，运行网站不需要 Windows 语音引擎。

### FPS 与网络延迟

大厅、等待房间、资料和设置的导航栏显示 FPS 与 RTT；手机放在导航栏第二行。游戏内统一显示在右上角，大屏导航另显示 P95 帧间隔。FPS 按真实 requestAnimationFrame 间隔采样，每秒只更新监测组件；RTT 每 5 秒通过认证后的 `system:ping` 测量一次，包含到游戏服务器的网络往返和响应时间。断线显示“离线”，3 秒未响应显示“超时”，后台标签暂停帧采样。

大厅对内容相同的房间摘要去重，返回房间入口只订阅必要字段，游戏封面 memo 化；首页装饰浮动改用 CSS transform，滚动和离开可视区域时暂停，滚动时减少顶栏背景模糊，卡片使用局部绘制隔离。监测数据不会写入应用 Zustand 状态或 MySQL。FPS 是浏览器动画帧速率，受设备刷新率、浏览器和后台节流影响，并非 GPU 硬件计数。

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

Prisma schema 包含 `User`、`Game`、`Room`、`RoomPlayer`、`Match`、`MatchPlayer`、`ChatMessage`、`Friend`、`Ranking`。种子数据仅建立八款游戏元数据，不虚构战绩。访客身份首次进入大厅自动创建，凭证哈希保存于数据库，本机保存随机 token。

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
| `/lobby` | 八款游戏入口、名称搜索、分类/人数/模式筛选、排序、实时房间列表、创建/加入、好友抽屉 |
| `/room/:roomId` | 房间码、复制邀请、座位、准备、AI 添加/移除、难度选择、规则、聊天、房主开局 |
| `/game/:roomId` | 一屏沉浸牌桌、四向玩家席位、最近两位玩家出牌、席位倒计时、牌堆/匹配提示、扇形手牌、选择/拖拽出牌、独立 UNO 按钮、摸牌高亮、万能牌选色、动态/聊天抽屉、结果和再来一局 |
| `/profile` | 玩家 ID、金币/等级、最近 20 局、排行榜、复制好友 ID |
| `/settings` | 八套颜色主题（含三套渐变）、修改昵称、减少动画、运行模式与连接说明 |
| `/xiangqi/endgames` | 五个经典杀法教学残局、棋盘预览、AI 难度、通关进度与一键挑战 |

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

`GameDefinition<State, Action, View, Options>`：`id/name/minPlayers/maxPlayers/createState/applyAction/getLegalActions/aiMove/getView`；第四个可选泛型允许每款游戏定义自己的规则配置。四款开放游戏独立实现，服务端统一分发动作，客户端按游戏加载桌面。

UNO AI 每次动作由服务端设置 2000–3000ms 思考时间，包括 AI 摸牌后继续出牌，以及断线玩家的 AI 接管；调度器在时间到达后执行。简单随机合法动作；中等根据手牌颜色数量、效果牌和下一位公共手牌数量评分；UNO 困难档当前回退中等策略。AI 函数只接受 `UnoView`，没有牌堆顺序和对手手牌。观战者手牌数组为空。

卡牌 2.5:3.5，扇形排列，悬停上浮 8px + rotateX/rotateY，选中放大 1.15 倍；普通灰边、稀有蓝边、史诗紫色粒子、传说金色呼吸光；发牌翻转与出牌拖尾。封面为本地 CSS/SVG 图形，无外部图片或字体依赖。支持系统减少动画偏好和设置页面动画开关。

## 6. 开发顺序与目录

### 斗地主模块

大厅点击「斗地主」→ 创建固定三人房间 → 邀请两位朋友或添加两位 AI → 所有真人准备 → 房主开始。三张底牌在叫分时只显示牌背，定地主后公开。玩家可多选手牌、使用「提示」循环合法组合、清空选择、出牌或不出；手机可左右滑动手牌。两位对手以等数量牌背显示剩余牌数，当前玩家名片显示计时器；聊天、动态和规则默认折叠。炸弹、王炸、飞机有组合特效与音效，结束时居中显示阵营、倍数与三位玩家的对局分，可再来一局或返回大厅。

采用三人经典叫分规则，参考[清华五道口比赛说明](https://alumni.pbcsf.tsinghua.edu.cn/info/1002/1568.htm)：54 张牌，每人 17 张、底牌 3 张；每人叫分一次，只能叫更高分，3 分立即定地主，三家不叫重新发牌并轮换首叫者。地主 20 张先出，按座位逆时针轮转。牌序为 3 至 A、2、小王、大王；普通牌须同牌型、同张数、主体更大，炸弹压普通牌，王炸最大。两家连续不出后，最后出牌者重新领出。地主清空手牌则地主胜，任一农民清空手牌则两位农民共同胜。

支持单张、对子、三张、三带单 / 对、至少五张顺子、至少三对连对、至少两组飞机及单 / 对附件、四带二单 / 两对、炸弹、王炸。2 和王不能进入连续牌的主体。本桌附件采用[波克官方牌型说明](https://mm.pook.com/ddz/rule/rule-2.html)的独立单翼约定：飞机单翼必须不同点数且不能带双王；四带二单不能带对子或王，四带二对必须为不同的两组对子。各平台附件规则有差异，游戏内规则明确写出本桌版本。未加入癞子、明牌、抢地主和额外加倍阶段。

叫分为底分；每个炸弹或王炸使倍数 ×2。地主胜且两位农民均未出牌为春天，农民胜且地主只出过一手为反春天，再 ×2。对局分 = 底分 × 倍数，地主承担两份、每位农民一份，三方分数之和为零。对局分、阵营、底牌、公开出牌记录与倍数保存到 Match.publicResult；MatchPlayer、金币与 Ranking 沿用大厅奖励：每位胜者 +30 战绩积分 / +100 金币，败者 +5 / +10，两位农民的胜负、奖励和排行都正确归队；免费房间不扣金币。

服务端拒绝抢回合、替他人出牌、重复 ID、未持有的牌、无效牌型、不能压过的组合及跨游戏动作。叫分 20 秒、出牌 45 秒，超时或离线由 AI 代打，重连恢复本人手牌和当前阶段。对局中只向本人发送自己的手牌；观战者没有手牌，底牌在定地主前隐藏，对局结束才允许公开剩余手牌。

AI 延迟 500–1500ms，在独立工作线程中只获取 `DoudizhuView`：简单随机合法动作；中等评估叫分、组合结构、拆牌代价、对手剩余牌数，并配合农民队友；困难在中等策略上进行有时间预算的三层剩余手牌组合搜索，不假设或读取对手手牌。AI、超时代打和真人动作都进入既有 revision/规则校验路径。

### 中国象棋模块

大厅点击「中国象棋」→ 选择「标准对局」或「经典残局」。标准对局复用原有创建房间、邀请、准备、AI 补位与开始流程，固定两人，座位 1 执红先手、座位 2 执黑后手。创建时可设置 30–180 秒每步时限及超时判负；关闭超时判负时由 AI 临时代下。黑方棋盘自动旋转，使自己的棋子在下方，棋子文字仍保持正向。点击己方棋子，再点击高亮合法落点；服务器按认证身份、回合和 revision 校验，拒绝替对手走棋、抢回合、越界、友军吃子和不合法应将。

规则参考 [Xiangqi.com 棋子走法](https://www.xiangqi.com/help/pieces-and-moves) 和 [世界象棋联合会规则](https://www.wxf-xiangqi.org/images/wxf-rules/2018_World_XiangQi_Rules_English2018.pdf)：9×10 交叉点棋盘、32 枚棋子；将帅九宫直走一步，仕士九宫斜走一步；相象走田、塞眼不可走且不能过河；马走日、蹩腿不可走；车沿直线无阻行走；炮不吃子时无阻，吃子时必须恰好隔一枚炮架；兵卒向前一步，过河后可以横走，不能后退。被将军必须应将，不能将帅照面。将死和困毙均判负，可主动认输。

大厅采用休闲重复判罚：同一棋盘且同一行动方出现三次，比较两轮循环，单方持续将军判负；单方持续追捉同一无保护大子判负（排除兵卒/将帅追捉、互吃与可回吃的交换），其余重复判和；连续 120 步无吃子且无兵卒向前则判和。**这不是完整 WXF 竞赛裁判**，复杂长捉、将捉交替及兵卒/受保护子特例不完整实现，详见 [完整 WXF 裁判规则实现研究](https://arxiv.org/html/2412.17334v1)。

经典残局提供重炮杀、马后炮、双车错、白脸将和二鬼拍门，每局给出主题、难度、棋盘预览和可展开提示。局面是参考 [经典将杀教程](https://www.xiangqi.com/articles/checkmate-strategies) 制作的原创教学安排，**不是古谱原局抄录**。四局一步杀，双车错两步连杀；全部解法逐步通过合法动作验证，双车错的黑方应将只有一个合法回复。玩家执红、AI 执黑；可以偏离参考答案自由走棋，AI 按公开局面防守。结果保存后可「重试残局」并在等待页准备开始，也可选择更多残局；通关进度按用户保存在本浏览器。残局棋谱写入 Match / MatchPlayer，但不增加金币、等级和 Ranking，个人资料显示「残局练习」。

象棋 AI 只读取公开棋盘：简单随机合法着法；中等结合子力、兵卒推进、中心位置、对方吃子威胁和一步将死进行评分；困难使用迭代加深 Minimax + Alpha-Beta（2–4 层、根 20/后续 10 个候选、8000 节点与约 300ms 搜索预算），一步将死直接优先执行。服务端等待 500–1500ms 后在工作线程计算，产出标准 `{ type:'move', from:{x,y}, to:{x,y} }`，与真人的 `game:action` 共用验证、同步和结算路径。刷新恢复同一公开棋盘，观战者不能走棋。

棋盘为深色玻璃、微光网格与楚河汉界，棋子采用立体木色红方和青光黑方；选中、合法落点、上一手、被将军的将帅和当前头像均有提示。棋子平滑移动，公开服务端动作触发动画与 Web Audio 合成音效，聊天快照、刷新及重连不重播历史。桌面、手机竖屏/横屏可用，规则、动态和聊天默认折叠；沿用音乐切换、音效音量、静音和减少动画设置。音效本地生成，不依赖远程音源。

| 棋子 | 移动声音 | 吃子声音与动画（红黑双方相同） |
| --- | --- | --- |
| 车 | 短促滚动声 | 引擎转速上升，棋子带金色拖尾加速撞碎目标 |
| 兵 / 卒、仕 / 士 | 齐步踏步声 | 挥剑与金属碰撞，刀剑斩碎目标 |
| 马 | 连续马蹄声 | 嘶鸣，棋子跃起幻化马蹄，踩碎目标 |
| 相 / 象 | 沉重巨兽踏步声 | 象鸣，原位象鼻卷起目标，甩向屏幕左右边缘，玻璃碎裂 |
| 帅 / 将 | 铠甲金属声 | 龙吟，棋子跃起化龙，龙形化旗帜钉碎目标 |
| 炮 | 木轮滚动声 | 离子炮蓄力、弧线炮弹和低频爆炸，目标棋面与字样破碎 |

这些声音通过本地 Web Audio 的音高、共振与噪声合成，不是动物或车辆实录。吃子特效使用原生 SVG / Web Animations，`xiangqi-timeline.ts` 为动画命中和命中声音提供同一时间点。渲染以单调时钟锚定，避免首次绘制拖慢特效；连续到达的真人或 AI 动作按顺序播放，后续棋盘暂时回溯为上一手的视觉投影，服务端状态与 revision 始终保持最新。播放期间锁定走棋交互，不更改 AI 延迟或权威规则。刷新、重连只展示最新棋盘，不补播历史。

UNO、五子棋、象棋结束后会自动弹出居中结算框：房主可在结果保存后「再来一局 / 重试残局」，所有人可「返回大厅」或「查看牌桌 / 棋盘」，残局另有「更多残局」。象棋等待最后一手动画完成后展示；关闭弹窗后，同一局的聊天和保存快照不会再次打开。重开沿用原房间准备流程。

象棋实时状态仍由原内存 / Redis RoomStore 保存，走棋不逐步写 MySQL。结束时复用原事务保存棋谱（含棋子身份、起止点、吃子、将军）、配置、结束原因、结果与标准对局奖励，无需扩展表结构。

### 五子棋模块

大厅选择「五子棋」→ 创建两人房间 → 邀请朋友或添加 AI → 双方准备 → 房主开始。座位 1 执黑先手，座位 2 执白后手。15×15 交叉点棋盘默认自由规则：横、竖、两条斜线连续五子或以上获胜；225 格全满且无五连判平局；无开局位置限制，也不采用交换开局。服务端按认证用户和房间版本拒绝重复落子、抢回合、观战落子和伪造动作。

创建房间时可配置：黑棋禁手（三三、四四、长连）、仅黑棋长连禁手、悔棋、认输、超时判负，以及 15–180 秒回合时限。禁手判断参考 [RIF 国际连珠规则 9.2–9.3](https://renju.se/rif/rifrules.htm)：四按棋子集合去重，真活三需要有合法的活四延伸，递归排除延伸自身禁手的假活三；恰好五连优先。这里采用「禁止在禁手点落子，提示重选」的大厅交互，未使用正式连珠比赛的禁手落子后判负和指定开局流程。仅长连选项限制黑棋六连及以上，白棋长连始终获胜。

悔棋需要对手同意，每人每局最多申请一次；撤回自己最后一步，以及对手已跟随落下的一步，恢复申请者的回合。拒绝不改变棋盘；申请不暂停计时，对手继续落子会取消申请。AI 会在思考延迟后同意有效悔棋。认输可在己方或对方回合确认，立即由服务端判对手获胜；未开启的选项不能被伪造请求使用。超时判负开启时，断线也继续计时，服务端裁判判负；关闭时超时或离线由 AI 临时代下。

AI 使用公开 `GomokuView`：简单从所有合法空位随机选点；中等按五格棋形进行进攻/防守评分，优先连五、堵四和堵三；困难使用 Minimax + Alpha-Beta，完成至少 4 层后在预算内尝试 5–6 层，仅考虑已有棋子周围两格内的候选点，并按启发式排序保留有限分支。直接连五或必须堵四的局面使用战术捷径。服务端设置 500–1500ms 思考等待；计算在 Node 工作线程执行，避免阻塞聊天和其他房间。AI 产出标准 `{ type: 'place', x, y }`，与 Socket.IO `game:action` 共用动作校验、版本检查、状态广播和结算入口，不绕过游戏规则。

棋盘采用暗色玻璃、青色微光网格、蓝紫高光黑子与青光白子；当前玩家头像呼吸高亮，落子弹跳，最后一步金色标记，胜利金色连线与粒子。聊天、动态默认折叠，桌面、手机竖屏/横屏和减少动画偏好可用；落子音效从公开服务端日志触发。

实时棋盘保存在原来的内存 / Redis 房间状态中，落子不逐步写 MySQL。结束时在原有事务内保存 Match、MatchPlayer、金币和按游戏的 Ranking，并在 `publicResult` 保存完整棋谱、规则、胜利线和结束原因；总排行榜汇总已开放游戏。平局的 `winnerId=null`，双方各获得参与奖励（10 金币、5 积分），不计胜场。新增迁移只将 `Match.winnerId` 改为可空，保留旧对局。无需新增 npm 依赖。

1. Vite / 路由 / UI / mock 游戏目录。
2. MySQL schema / Compose / 初始迁移 / 八款游戏 seed。
3. Socket.IO 房间生命周期、私有视图、聊天、权限和事务。
4. 独立 UNO GameDefinition。
5. 可见信息 AI、回合计时和延迟。
6. 卡牌/桌面动画、移动端与减少动画。
7. 重连、自动代打、结果幂等与验收测试。

```text
client/
  src/
    components/         # Layout, GameArt, PlayingCard, Chat, RoomDialogs, ui/*
    pages/              # Lobby, Room, GameTable(分发), UnoTable, GomokuTable, XiangqiTable, DoudizhuTable, XiangqiEndgames, Profile, Settings
    styles/doudizhu.css  # 斗地主牌桌、重叠手牌、移动端和组合动效
    components/PerformanceBar.tsx # 独立 FPS / P95 / RTT 采样显示
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
    gomoku-ai.ts        # 开发/生产通用的 AI 工作线程
    xiangqi-ai.ts       # 公开棋盘象棋 AI 工作线程
    doudizhu-ai.ts      # 只接收本人视图的斗地主 AI 工作线程
shared/
  types.ts
  catalog.ts
  games/
    definition.ts
    uno/index.ts        # 完整 UNO 规则和公平 AI
    gomoku/
      index.ts          # 五子棋状态、合法动作、悔棋/认输/超时
      types.ts          # 棋盘、动作和可选规则类型
      rules.ts          # 连珠和递归禁手检测
      ai.ts             # 随机 / 启发式 / Alpha-Beta
    xiangqi/
      index.ts          # 象棋 GameDefinition、动作、将死/困毙/结算
      types.ts          # 红黑棋子、棋盘、动作与残局配置
      rules.ts          # 七种棋子走法、将军与合法动作
      repetition.ts     # 休闲长将/长捉及重复局面判罚
      ai.ts             # 随机 / 评分 / 迭代 Alpha-Beta
      endgames.ts       # 五个经典杀法教学局面与验证答案
    doudizhu/
      index.ts          # 叫分、发牌、回合、地主/农民结算与私有视图
      types.ts          # 扑克牌、牌型、动作与阵营类型
      cards.ts          # 54 张牌、洗牌、排序和分组
      rules.ts          # 14 种牌型、大小比较与合法组合枚举
      ai.ts             # 随机 / 搭档启发式 / 剩余手牌组合搜索
    holdem/index.ts
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  uno.test.ts
  rooms.test.ts
  gomoku.test.ts
  gomoku-rooms.test.ts
  e2e/gomoku.spec.ts
  xiangqi.test.ts
  xiangqi-rooms.test.ts
  doudizhu.test.ts
  doudizhu-rooms.test.ts
  performance.test.ts
  e2e/doudizhu.spec.ts
  e2e/xiangqi.spec.ts
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
| `system:ping` | 网络 RTT 测量，直接 ack 服务端时间，不读写数据库 |

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
