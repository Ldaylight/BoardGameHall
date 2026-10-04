import { useEffect, useState } from 'react';
import { Coins, Copy, Crown, Gamepad2, Medal, Trophy } from 'lucide-react';
import { Avatar } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { api, perform } from '@/lib/api';
import { useApp } from '@/stores/app';
import type { ProfileData } from '../../../shared/types';
export function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const session = useApp((s) => s.session);
  useEffect(() => {
    if (session) void perform(async () => setProfile(await api<ProfileData>('/profile')));
  }, [session]);
  if (!profile)
    return (
      <div className="loading-panel">
        <Gamepad2 size={35} />
        <p>正在加载你的游乐场…</p>
      </div>
    );
  const wins = profile.matches.filter((m) => m.won).length;
  const count = profile.matches.length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR STORY, ONE GAME AT A TIME</span>
          <h1>我的游乐场</h1>
          <p>每一场好牌局，都值得被记住。</p>
        </div>
      </div>
      <div className="profile-grid">
        <div>
          <section className="panel profile-card">
            <Avatar name={profile.user.name} size="avatar-lg" />
            <h2>{profile.user.name}</h2>
            <div className="profile-id">玩家 ID · {profile.user.id}</div>
            <p>Lv. {profile.user.level} · 快乐冒险家</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void perform(async () => {
                  await navigator.clipboard.writeText(profile.user.id);
                  useApp.getState().notify('玩家 ID 已复制，可分享给朋友添加好友', 'success');
                })
              }
            >
              <Copy size={13} />
              复制玩家 ID
            </Button>
            <div className="profile-stats">
              <div>
                <b>{count}</b>
                <span>最近对局</span>
              </div>
              <div>
                <b>{wins}</b>
                <span>胜利</span>
              </div>
              <div>
                <b>{count ? Math.round((wins / count) * 100) : 0}%</b>
                <span>近期胜率</span>
              </div>
            </div>
          </section>
          <section className="panel mt-6">
            <h2 className="panel-title">
              <Crown size={18} />
              桌游总排行榜
            </h2>
            {profile.rankings.length ? (
              profile.rankings.slice(0, 10).map((r, i) => (
                <div className="ranking-row" key={r.user.id}>
                  <span className="rank-number">{String(i + 1).padStart(2, '0')}</span>
                  <Avatar name={r.user.name} />
                  <div>
                    {r.user.name}
                    <small>
                      {r.wins} 胜 / {r.played} 局
                    </small>
                  </div>
                  <span>{r.score}</span>
                </div>
              ))
            ) : (
              <p className="profile-empty">打完第一局，留下你的名字。</p>
            )}
          </section>
        </div>
        <div>
          <div className="stat-cards">
            <section className="panel stat-card">
              <Coins size={21} />
              <b>{profile.user.coins.toLocaleString()}</b>
              <p>休闲金币 · 无现金价值</p>
            </section>
            <section className="panel stat-card">
              <Trophy size={21} />
              <b>{profile.rankings.find((r) => r.user.id === profile.user.id)?.wins ?? 0}</b>
              <p>总胜场</p>
            </section>
            <section className="panel stat-card">
              <Medal size={21} />
              <b>{profile.user.level}</b>
              <p>当前等级</p>
            </section>
          </div>
          <section className="panel">
            <h2 className="panel-title">
              <Gamepad2 size={18} />
              最近对局 <span>最近 20 场</span>
            </h2>
            {profile.matches.length ? (
              profile.matches.map((m) => (
                <div className="history-row" key={m.id}>
                  <span>
                    {m.gameName}
                    <small>{new Date(m.createdAt).toLocaleString('zh-CN')}</small>
                  </span>
                  <span className={`result-badge ${m.won ? '' : 'loss'}`}>
                    {m.draw ? '平局' : m.won ? '胜利' : '参与'}
                  </span>
                  <span>
                    {m.training ? '残局练习' : `+${m.coinsDelta ?? (m.won ? 100 : 10)} 金币`} · {m.score} 积分
                  </span>
                </div>
              ))
            ) : (
              <div className="profile-empty">
                你的第一场精彩，尚未开场。
                <br />
                去大厅创建 UNO 或五子棋房间，试试身手。
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
