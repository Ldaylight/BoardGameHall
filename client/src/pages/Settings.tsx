import { useState } from 'react';
import { Palette, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, perform } from '@/lib/api';
import { useApp } from '@/stores/app';
import type { User } from '../../../shared/types';
import { themes } from '@/lib/themes';
import { AudioSettings } from '@/components/AudioSettings';
export function Settings() {
  const session = useApp((s) => s.session);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const [name, setName] = useState(session?.user.name ?? localStorage.getItem('playroom-name') ?? '冒险家');
  const [motion, setMotion] = useState(localStorage.getItem('playroom-motion') !== 'off');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await perform(async () => {
      const user = await api<User>('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      if (session) useApp.getState().setSession({ ...session, user });
      localStorage.setItem('playroom-name', user.name);
      useApp.getState().notify('个人资料已更新', 'success');
    });
    setBusy(false);
  }
  function setReduced(v: boolean) {
    setMotion(v);
    useApp.setState({ motionEnabled: v });
    localStorage.setItem('playroom-motion', v ? 'on' : 'off');
    document.body.classList.toggle('reduce-motion', !v);
  }
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>按你的方式，玩得尽兴</h1>
          <p>一点小调整，让每一局更舒服。</p>
        </div>
      </div>
      <AudioSettings />
      <section className="panel settings-section">
        <h2 className="panel-title">
          <UserRound size={18} />
          个人资料
        </h2>
        <div className="settings-row">
          <div>
            <b>你的昵称</b>
            <p>其他玩家在大厅与牌桌看到的名字。</p>
          </div>
          <input
            type="text"
            aria-label="昵称"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="settings-row">
          <div>
            <b>保存资料</b>
            <p>修改后，在下一次加入房间时生效。</p>
          </div>
          <Button size="sm" disabled={busy || !name.trim() || !session} onClick={() => void save()}>
            {busy ? '保存中…' : '保存更改'}
          </Button>
        </div>
      </section>
      <section className="panel settings-section">
        <h2 className="panel-title">
          <Palette size={18} />
          视觉与体验
        </h2>
        <div className="settings-row">
          <div>
            <b>卡牌与界面动效</b>
            <p>发牌、翻牌、粒子与悬停效果。关闭后减少动画。</p>
          </div>
          <button
            role="switch"
            aria-checked={motion}
            aria-label="卡牌与界面动效"
            className={`toggle ${motion ? 'on' : ''}`}
            onClick={() => setReduced(!motion)}
          />
        </div>
        <div className="settings-row">
          <div>
            <b>界面主题</b>
            <p>选择喜欢的配色，立即应用并保存在本设备。</p>
          </div>
          <span className="result-badge">{themes.find((t) => t.id === theme)?.name}</span>
        </div>
        <div className="theme-options" role="group" aria-label="界面主题">
          {themes.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={theme === option.id}
              className={`theme-option ${theme === option.id ? 'selected' : ''}`}
              onClick={() => setTheme(option.id)}
            >
              <span
                className="theme-preview"
                style={{ background: 'gradient' in option ? option.gradient : option.background }}
              >
                <span style={{ background: option.surface }} />
                <i style={{ background: option.accent }} />
                <b style={{ color: option.accent }}>✦</b>
              </span>
              <strong>
                {option.name}
                <span>{theme === option.id ? '✓' : ''}</span>
              </strong>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="panel settings-section">
        <h2 className="panel-title">
          <ShieldCheck size={18} />
          连接与数据
        </h2>
        <div className="settings-row">
          <div>
            <b>运行模式</b>
            <p>
              {session?.demo
                ? '体验模式：房间、聊天和战绩在服务端内存，重启后清空。'
                : 'MySQL 模式：用户、聊天、战绩和排行榜持久化保存。'}
            </p>
          </div>
          <span className="result-badge">{session?.demo ? 'DEMO' : 'ONLINE'}</span>
        </div>
        <div className="settings-row">
          <div>
            <b>断线自动恢复</b>
            <p>本设备保存访客凭证；刷新后自动恢复原座位。单机房间在后端重启后失效，Redis 模式可恢复。</p>
          </div>
          <span className="result-badge">已启用</span>
        </div>
        <p className="settings-note">
          金币仅为休闲战绩奖励，无购买、提现或现金投注。创建房间免费。体验版使用访客身份，发布到公开网络前需接入正式账号系统。
        </p>
      </section>
      <div className="lobby-bottom">
        <span>✦</span>
        <p>PLAYROOM v1.0.0 · 让每一场相聚都有好时光。</p>
      </div>
    </div>
  );
}
