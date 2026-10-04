import { useEffect, useRef, useState } from 'react';
import { Music2, Upload, Play, Square, Volume2, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { useAudio } from '@/stores/audio';
import { audioEngine } from '@/lib/audio-engine';
import { defaultAudio, musicTracks, type AudioScene } from '@/lib/audio-settings';
import { listLocalTracks, saveLocalTrack, removeLocalTrack, type LocalTrackInfo } from '@/lib/audio-library';

const scenes = [
  {
    id: 'lobby',
    key: 'lobbyTrack',
    title: '大厅音乐',
    hint: '大厅、等待房间、个人资料和设置使用这首音乐。',
    example: 'bleach',
  },
  {
    id: 'game',
    key: 'gameTrack',
    title: '对局音乐',
    hint: '进入牌桌时自动切换，返回大厅时自动恢复。',
    example: 'Once Upon A Time',
  },
] as const;

export function AudioSettings() {
  const p = useAudio((s) => s.preferences);
  const status = useAudio((s) => s.status);
  const message = useAudio((s) => s.message);
  const update = useAudio((s) => s.update);
  const [tracks, setTracks] = useState<LocalTrackInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inputs = useRef<Partial<Record<AudioScene, HTMLInputElement | null>>>({});
  useEffect(() => {
    let active = true;
    void listLocalTracks()
      .then((list) => {
        if (active) setTracks(list);
      })
      .catch(() => {
        if (active) setError('浏览器音乐库不可用，默认音乐仍可播放。');
      });
    return () => {
      active = false;
      audioEngine.endPreview();
    };
  }, []);

  async function importMusic(scene: AudioScene, file: File) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await audioEngine.validateFile(file);
      const track = await saveLocalTrack(file);
      setTracks(await listLocalTracks());
      update({ [scene === 'lobby' ? 'lobbyTrack' : 'gameTrack']: track.id });
      setNotice(`已导入「${track.name}」，并设为${scene === 'lobby' ? '大厅' : '对局'}音乐。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError('');
    try {
      await removeLocalTrack(id);
      update({
        ...(p.lobbyTrack === id ? { lobbyTrack: defaultAudio.lobbyTrack } : {}),
        ...(p.gameTrack === id ? { gameTrack: defaultAudio.gameTrack } : {}),
      });
      setTracks(await listLocalTracks());
      setNotice('音乐已删除，使用这首歌的场景已恢复默认音乐。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败。');
    } finally {
      setBusy(false);
    }
  }

  function toggle(key: 'musicEnabled' | 'effectsEnabled' | 'countdownEnabled', title: string, hint: string) {
    return (
      <div className="settings-row" key={key}>
        <div>
          <b>{title}</b>
          <p>{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={p[key]}
          aria-label={title}
          className={`toggle ${p[key] ? 'on' : ''}`}
          onClick={() => update({ [key]: !p[key] })}
        />
      </div>
    );
  }

  function volume(key: 'musicVolume' | 'effectsVolume', title: string) {
    return (
      <div className="settings-row audio-volume-row">
        <div>
          <b>{title}</b>
          <p>
            {key === 'musicVolume'
              ? '背景音乐单独调整，不影响按钮和牌局音效。'
              : '按钮、卡牌、倒计时与 UNO 语音使用这个音量。'}
          </p>
        </div>
        <div className="audio-volume">
          <Volume2 size={15} aria-hidden="true" />
          <input
            type="range"
            aria-label={title}
            min="0"
            max="100"
            step="1"
            value={Math.round(p[key] * 100)}
            onChange={(e) => update({ [key]: Number(e.target.value) / 100 })}
          />
          <output>{Math.round(p[key] * 100)}%</output>
        </div>
      </div>
    );
  }

  const statusText =
    status === 'locked'
      ? '点击开启声音，或点击页面任意按钮开始播放。'
      : status === 'unsupported'
        ? message
        : p.muted
          ? '所有声音已静音，点击右侧恢复。'
          : status === 'paused'
            ? '页面在后台时暂停，返回后继续播放。'
            : status === 'error'
              ? message
              : '声音已开启 · 曲目和音量即时生效';
  return (
    <section className="panel settings-section audio-settings" aria-label="音乐与音效设置">
      <h2 className="panel-title">
        <Music2 size={18} />
        音乐与音效
      </h2>
      <div className="audio-status" role="status" data-audio-status={status}>
        <span>
          <i className={status === 'ready' && !p.muted ? 'on' : ''} />
          {statusText}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            update({ muted: false });
            void audioEngine.unlock();
          }}
        >
          {status === 'locked' ? '开启声音' : '恢复声音'}
        </Button>
      </div>
      {toggle('musicEnabled', '背景音乐', '开启后，在大厅和对局间自动切换音乐。')}
      {volume('musicVolume', '音乐音量')}
      {scenes.map((scene) => (
        <div className="audio-track-row" key={scene.id}>
          <div>
            <b>{scene.title}</b>
            <p>{scene.hint}</p>
          </div>
          <div className="audio-track-controls">
            <select
              aria-label={scene.title}
              value={p[scene.key]}
              onChange={(e) => {
                setNotice('');
                update({ [scene.key]: e.target.value });
              }}
            >
              <optgroup label="默认原创音乐">
                {musicTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name} · {track.description}
                  </option>
                ))}
              </optgroup>
              {tracks.length > 0 && (
                <optgroup label="本机音乐">
                  {tracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {p[scene.key].startsWith('custom:') && !tracks.some((track) => track.id === p[scene.key]) && (
                <option value={p[scene.key]}>自定义音乐（加载中或需重新导入）</option>
              )}
            </select>
            <div className="audio-track-buttons">
              <Button
                size="sm"
                variant="outline"
                disabled={p.muted || !p.musicEnabled || status === 'unsupported'}
                aria-label={`试听${scene.title}`}
                onClick={() => {
                  setNotice(`正在试听${scene.title}，15 秒后恢复当前页面音乐。`);
                  void audioEngine.preview(scene.id);
                }}
              >
                <Play size={13} />
                试听
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                aria-label={`导入${scene.title}`}
                onClick={() => inputs.current[scene.id]?.click()}
              >
                <Upload size={13} />
                {busy ? '处理中…' : '导入音乐'}
              </Button>
              <input
                ref={(element) => {
                  inputs.current[scene.id] = element;
                }}
                type="file"
                hidden
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
                aria-label={`${scene.title}文件`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void importMusic(scene.id, file);
                }}
              />
            </div>
            <small>想播放《{scene.example}》？导入你已有的音频文件即可。</small>
          </div>
        </div>
      ))}
      <div className="audio-preview-actions">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            audioEngine.endPreview();
            setNotice('已恢复当前页面音乐。');
          }}
        >
          <Square size={12} />
          结束试听
        </Button>
      </div>
      {toggle(
        'effectsEnabled',
        '交互与游戏音效',
        '按钮、悬停、发牌、摸牌、出牌、特殊牌、轮到你、胜负与 UNO 语音。',
      )}
      {volume('effectsVolume', '音效音量')}
      {toggle('countdownEnabled', '每秒倒计时音效', '所有玩家的回合每秒轻响，最后 5 秒使用更明显的提示音。')}
      <div className="audio-samples" role="group" aria-label="音效试听">
        <Button
          size="sm"
          variant="outline"
          disabled={!p.effectsEnabled || p.muted}
          onClick={() => {
            void audioEngine.unlock().then(() => audioEngine.effect('deal'));
          }}
        >
          试听发牌
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!p.effectsEnabled || p.muted}
          onClick={() => {
            void audioEngine.unlock().then(() => audioEngine.effect('wild4'));
          }}
        >
          试听 +4
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!p.effectsEnabled || p.muted}
          onClick={() => {
            void audioEngine.unlock().then(() => audioEngine.effect('uno'));
          }}
        >
          试听 UNO 语音
        </Button>
      </div>
      {tracks.length > 0 && (
        <div className="audio-library">
          <b>本机音乐库</b>
          {tracks.map((track) => (
            <div key={track.id}>
              <span>{track.name}</span>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy}
                aria-label={`删除音乐 ${track.name}`}
                onClick={() => void remove(track.id)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="audio-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="audio-notice" role="status">
          {notice}
        </p>
      )}
      <p className="settings-note">
        默认曲目是项目原创合成音乐，不是上面两首歌的录音。导入的歌曲仅保存在当前浏览器，不上传服务器；音量和曲目选择会在刷新后保留。页面首次打开需点击或按键以开启声音。
      </p>
    </section>
  );
}
