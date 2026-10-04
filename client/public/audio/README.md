默认背景音乐及按钮/牌局音效由 `client/src/lib/audio-engine.ts` 的 Web Audio 合成器实时生成，旋律由本项目编写，无远程播放依赖。

`uno.wav` 是 Windows 自带 Microsoft Zira Desktop 语音引擎合成的 “Uno!” 短语，不是从歌曲或其他游戏中提取的录音。客户端优先播放此本地文件，加载失败时回退到浏览器语音合成。运行项目不需要 Windows 或该语音引擎。

用户从设置导入的音频保存在本机 IndexedDB，仅用于该浏览器的背景音乐，不会上传服务器或进入 Git 仓库。

`joker-laugh.wav` 是 Windows 自带 Microsoft Huihui Desktop 合成的“哈哈，哈哈哈哈！”短语，播放时降低音高并加入短回声，作为 UNO +2 / +4 成功出牌的小丑笑声。只在服务端公布出牌事件后播放；摸罚牌、选牌与按 UNO 按钮均不会触发。文件加载失败会使用短促的合成笑声音型。斗地主炸弹、王炸、飞机音效亦为本项目的 Web Audio 合成音。
