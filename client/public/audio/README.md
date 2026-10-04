默认背景音乐及按钮/牌局音效由 `client/src/lib/audio-engine.ts` 的 Web Audio 合成器实时生成，旋律由本项目编写，无远程播放依赖。

`uno.wav` 是 Windows 自带 Microsoft Zira Desktop 语音引擎合成的 “Uno!” 短语，不是从歌曲或其他游戏中提取的录音。客户端优先播放此本地文件，加载失败时回退到浏览器语音合成。运行项目不需要 Windows 或该语音引擎。

用户从设置导入的音频保存在本机 IndexedDB，仅用于该浏览器的背景音乐，不会上传服务器或进入 Git 仓库。
