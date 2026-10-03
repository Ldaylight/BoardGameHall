# 验收记录

验收日期：2026-10-03。环境：Windows、Node.js 22.15.1、MySQL 8.0.34、本机 Microsoft Edge。

| 项目 | 结果与证据 |
| --- | --- |
| 依赖安装 | 腾讯镜像 npm install 成功；已提交 package-lock.json；Prisma Client 6.19 生成成功 |
| TypeScript | npm run typecheck：前端、共享规则、后端均通过严格类型检查 |
| 规则 / 房间 | npm test：17 / 17 通过；原有规则与权限测试，以及公开出牌仅保留最近两位玩家/覆盖/隐藏手牌、独立 UNO 声明权限/刷新投影/回合和摸牌失效/漏喊罚两张、刷新查询当前房间与明确离开后重新建房 |
| 浏览器 | npm run test:e2e：7 / 7 通过；原有大厅/房间/双人对局/拖拽测试，以及八套主题（含渐变）切换与刷新保存、返回房间/叉号离开/重新建房、独立四玩家四向布局/席位计时/动态与聊天开关/一屏显示；真实双玩家规则推进到两张手牌时 UNO 激活/声明刷新恢复/出牌到一张不受罚/必需摸牌高亮/横屏操作按钮可见 |
| 浏览器错误 | 上述浏览器测试同时捕获 pageerror 和 console.error，最终为零 |
| MySQL 迁移 | npm run db:migrate：初始迁移成功，9 张业务表；utf8mb4 / utf8mb4_unicode_ci |
| MySQL 种子 | npm run db:seed：成功初始化五款游戏；重复运行 upsert 不重复创建 |
| 真实联机对局 | npm run verify:online：MySQL + 真实 Socket.IO 双玩家完整对局成功，中文/表情聊天落库、好友关系、观战手牌隐藏、重连手牌一致、对局仅结束时落库、Match / MatchPlayer 与金币/排行榜结算、再来一局；仅清理脚本自己生成的 UUID 测试数据 |
| 生产构建 | npm run build：前端静态文件与后端 ESM TypeScript 编译成功 |
| 生产启动 | 通过 verify:production 检查编译后的 Express 静态资源、SPA 深层路由、同源 Socket.IO、个人资料与设置 |
| 视觉检查 | .artifacts 中保存大厅、房间、一屏 UNO 桌面/手机/横屏、动态抽屉、紫色与渐变主题设置/牌桌截图；实际查看并修复缩小卡牌椭圆比例、手牌裁切和横屏间距 |

## 数据保护

原 `board_game_lobby` 中存在其他表与迁移记录，未 reset/drop，也未向其应用本项目迁移。本机 `.env` 使用独立数据库 `board_game_lobby_playroom`，账户 `root`，密码按用户指定。示例 `.env.example` 仍使用标准库名 `board_game_lobby`。

## 未在本机实测的部分

- 本机没有 Docker 命令，未实际运行 docker compose；提供 MySQL 8.0 与 Redis 7 Compose 配置。MySQL 实际迁移、seed 和联机操作已经使用现有 MySQL 8.0 实测。
- 本机没有 Redis 服务，未执行跨两个 Redis 实例连接节点的运行验收。Redis 状态存储、锁续租、adapter、持久化回合/AI 调度时间与恢复逻辑已经实现并通过类型构建检查，但仍需在有 Redis 的环境运行跨进程对局验证。
- 五子棋、中国象棋、斗地主、德州扑克只保留入口与独立类型契约。困难 AI 搜索/蒙特卡洛待扩展，界面明确标注当前回退中等启发式。
- 单机实时状态在内存，后端重启后牌局失效；Redis 模式保存实时状态。访客 token 登录为示例身份，不含密码账号注册系统。

## 复验

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run db:migrate
npm run db:seed
npm run verify:online
npm run build
npm run verify:production
```
