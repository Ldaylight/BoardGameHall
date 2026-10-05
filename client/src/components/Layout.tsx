import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  CircleHelp,
  Coins,
  DoorOpen,
  Crown,
  Gamepad2,
  LayoutGrid,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { useApp } from '@/stores/app';
import { api, leaveRoom, perform } from '@/lib/api';
import type { ProfileData } from '../../../shared/types';
import { games } from '../../../shared/catalog';
import { CreateRoomDialog, JoinRoomDialog } from './RoomDialogs';
import { AudioButton } from './AudioController';
import { PerformanceBar } from './PerformanceBar';
export function Brand() {
  return (
    <Link to="/lobby" className="brand">
      <span className="brand-icon">
        <svg width="26" height="26" viewBox="0 0 32 32">
          <path d="m5 9 11-6 11 6v14l-11 6-11-6Z" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="m5 9 11 6 11-6M16 15v14" stroke="currentColor" strokeWidth="2.2" fill="none" />
        </svg>
      </span>
      <span>
        PLAYROOM<small>卓游 · 聚在一起</small>
      </span>
    </Link>
  );
}
export function Avatar({ name, ai = false, size = '' }: { name: string; ai?: boolean; size?: string }) {
  return (
    <span className={`avatar ${ai ? 'avatar-ai' : ''} ${size}`}>
      {ai ? <Gamepad2 size={21} /> : name.slice(0, 1)}
    </span>
  );
}
export function Layout() {
  const [drawer, setDrawer] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [help, setHelp] = useState(false);
  const [topSearch, setTopSearch] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [joinRoomOpen, setJoinRoomOpen] = useState(false);
  const activeRoom = useApp(
    useShallow((s) => {
      const r = s.activeRoomId ? s.roomsById[s.activeRoomId] : null;
      return r ? { id: r.id, code: r.code, status: r.status, hasGame: !!r.game } : null;
    }),
  );
  const shell = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const user = useApp((s) => s.session?.user);
  const connected = useApp((s) => s.connected);
  const demo = useApp((s) => s.session?.demo);
  const toast = useApp((s) => s.toast);
  const location = useLocation();
  useEffect(() => {
    setMobile(false);
  }, [location.pathname]);
  useEffect(() => {
    if (location.pathname !== '/lobby') return;
    let idle: ReturnType<typeof setTimeout>;
    const scroll = () => {
      shell.current?.classList.add('lobby-scrolling');
      clearTimeout(idle);
      idle = setTimeout(() => shell.current?.classList.remove('lobby-scrolling'), 180);
    };
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', scroll);
      clearTimeout(idle);
      shell.current?.classList.remove('lobby-scrolling');
    };
  }, [location.pathname]);
  return (
    <div ref={shell} className={`app-shell ${location.pathname.startsWith('/game/') ? 'game-shell' : ''}`}>
      <header className="topbar">
        <div className="brand-wrap">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            onClick={() => setMobile(true)}
            aria-label="展开导航"
          >
            <Menu size={22} />
          </Button>
          <Brand />
        </div>
        <nav className="top-nav">
          <NavLink to="/lobby">发现好游戏</NavLink>
          <NavLink to="/profile">我的游乐场</NavLink>
        </nav>
        <form
          className="top-search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/lobby?q=${encodeURIComponent(topSearch)}`);
          }}
        >
          <Search size={15} />
          <input
            aria-label="全局游戏搜索"
            placeholder="搜一个好游戏…"
            value={topSearch}
            onChange={(e) => setTopSearch(e.target.value)}
          />
          <kbd>↵</kbd>
        </form>
        <div className="nav-room-actions">
          <Button variant="outline" size="sm" onClick={() => setJoinRoomOpen(true)}>
            <DoorOpen size={15} />
            房间码加入
          </Button>
          <Button size="sm" onClick={() => setCreateRoomOpen(true)}>
            <Plus size={15} />
            创建房间
          </Button>
        </div>
        <div className="top-actions">
          <PerformanceBar game={location.pathname.startsWith('/game/')} />
          <AudioButton />
          <span className="coins">
            <Coins size={17} />
            {user?.coins.toLocaleString() ?? '1,000'}
            <span className="coin-label">金币</span>
          </span>
          <button className="icon-button" aria-label="打开好友与邀请" onClick={() => setDrawer(true)}>
            <Bell size={20} />
            <i className="notification-dot" />
          </button>
          <NavLink to="/settings" className="icon-button" aria-label="设置">
            <Settings size={20} />
          </NavLink>
          <Link to="/profile" className="user-menu">
            <Avatar name={user?.name ?? '冒'} />
            <span>
              {user?.name ?? '冒险家'}
              <small>Lv. {user?.level ?? 1}</small>
            </span>
            <ChevronDown size={14} />
          </Link>
        </div>
      </header>
      <CreateRoomDialog open={createRoomOpen} onOpenChange={setCreateRoomOpen} />
      <JoinRoomDialog open={joinRoomOpen} onOpenChange={setJoinRoomOpen} />
      {activeRoom && !location.pathname.endsWith(`/${activeRoom.id}`) && (
        <div className="room-return-bar">
          <div className="room-return-control">
            <Link
              to={`/${activeRoom.hasGame ? 'game' : 'room'}/${activeRoom.id}`}
              className="room-return-link"
            >
              <Gamepad2 size={16} />
              <b>回到房间</b>
              <span>{activeRoom.code}</span>
              <small>
                {activeRoom.status === 'playing'
                  ? '对局进行中'
                  : activeRoom.status === 'finished'
                    ? '本局已结束'
                    : '等待开局'}
              </small>
              <span aria-hidden="true">↗</span>
            </Link>
            <button
              className="room-return-close"
              aria-label="离开房间并关闭返回入口"
              title="离开房间并关闭返回入口"
              disabled={!connected || leaving}
              onClick={() => {
                setLeaving(true);
                void perform(() => leaveRoom(activeRoom.id)).finally(() => setLeaving(false));
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      <div className="shell-body">
        <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
          <div className="sidebar-top">
            <span className="eyebrow">LET’S PLAY</span>
            <button
              className="mobile-close icon-button"
              onClick={() => setMobile(false)}
              aria-label="关闭导航"
            >
              <X size={20} />
            </button>
          </div>
          <NavLink to="/lobby" className="side-link">
            <LayoutGrid size={18} />
            桌游大厅<span className="nav-count">{String(games.length).padStart(2, '0')}</span>
          </NavLink>
          <NavLink to="/profile" className="side-link">
            <Crown size={18} />
            战绩与排行榜
          </NavLink>
          <button className="side-link" onClick={() => setDrawer(true)}>
            <Users size={18} />
            好友与邀请
          </button>
          <NavLink to="/settings" className="side-link">
            <Settings size={18} />
            主题与设置
          </NavLink>
          <div className="sidebar-divider" />
          <div id="filter-slot" />
          <div className="sidebar-bottom">
            <div className="sidebar-promo">
              <span className="promo-symbol">✦</span>
              <strong>一个人，也能开局</strong>
              <p>
                AI 伙伴随时就位
                <br />
                练练手，让下一局更精彩。
              </p>
              <Link to="/lobby?mode=ai">
                探索人机对战 <span>↗</span>
              </Link>
            </div>
            <button className="side-link help-link" onClick={() => setHelp(true)}>
              <CircleHelp size={17} />
              新手指南<span>↗</span>
            </button>
          </div>
        </aside>
        {mobile && <div className="mobile-scrim" onClick={() => setMobile(false)} />}
        <main className="main-content">
          <Outlet context={{ openFriends: () => setDrawer(true) }} />
        </main>
      </div>
      <footer className="statusbar">
        <span className={connected ? 'status-online' : 'status-offline'}>
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connected ? '已连接 · 实时同步' : '正在连接服务器…'}
          <i /> {demo ? '体验模式 · 内存房间' : 'MySQL 联机模式'}
        </span>
        <span>
          MADE FOR GOOD TIMES <span className="footer-star">✦</span>
          <b>v1.0.0</b>
        </span>
      </footer>
      <button className="friends-fab" onClick={() => setDrawer(true)} aria-label="打开社交抽屉">
        <MessageSquare size={20} />
        <span>一起玩</span>
      </button>
      <SocialDrawer open={drawer} onOpenChange={setDrawer} />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle className="modal-title">第一局，从这里开始</DialogTitle>
          <DialogDescription className="modal-desc">三步进入你的游乐场。</DialogDescription>
          <ol className="guide-list">
            <li>
              <b>挑选 UNO，创建房间。</b>
              <p>设置人数、AI 难度和观战权限。</p>
            </li>
            <li>
              <b>邀请朋友，或添加 AI。</b>
              <p>复制邀请链接，朋友可用独立浏览器加入。所有真人点击准备，房主即可开始。</p>
            </li>
            <li>
              <b>匹配颜色或数字，打出手牌。</b>
              <p>点选或拖动牌到桌面；没有牌可出时摸一张。最先清空手牌获胜。</p>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
      {toast && (
        <div role="status" className={`toast ${toast.kind}`}>
          <span>{toast.kind === 'success' ? '✓' : '!'}</span>
          {toast.text}
          <button onClick={() => useApp.setState({ toast: null })} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function SocialDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<'friends' | 'online'>('friends');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [friendId, setFriendId] = useState('');
  const [join, setJoin] = useState(false);
  const online = useApp((s) => s.online);
  const session = useApp((s) => s.session);
  useEffect(() => {
    if (open && session) void perform(async () => setProfile(await api<ProfileData>('/profile')));
  }, [open, session]);
  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    await perform(async () => {
      await api('/friends', { method: 'POST', body: JSON.stringify({ userId: friendId.trim() }) });
      setProfile(await api<ProfileData>('/profile'));
      setFriendId('');
      useApp.getState().notify('好友已添加', 'success');
    });
  }
  const people =
    tab === 'friends' ? (profile?.friends ?? []) : online.filter((u) => u.id !== session?.user.id);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="social-drawer">
          <div className="eyebrow">BETTER TOGETHER</div>
          <DialogTitle className="modal-title">一起玩，才尽兴</DialogTitle>
          <DialogDescription className="modal-desc">下一场好牌局，从一句邀请开始。</DialogDescription>
          <div className="drawer-tabs">
            <button className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>
              我的好友 <span>{profile?.friends.length ?? 0}</span>
            </button>
            <button className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}>
              在线玩家 <span>{Math.max(online.length - 1, 0)}</span>
            </button>
          </div>
          <div className="people-list">
            {people.length ? (
              people.map((p) => (
                <div className="person-row" key={p.id}>
                  <Avatar name={p.name} />
                  <span>
                    <b>{p.name}</b>
                    <small>
                      {online.some((u) => u.id === p.id) ? '在线 · 可以邀请' : '离线'} · Lv.{p.level}
                    </small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`复制 ${p.name} 的好友 ID`}
                    onClick={() =>
                      void perform(async () => {
                        await navigator.clipboard.writeText(p.id);
                        useApp.getState().notify('好友 ID 已复制', 'success');
                      })
                    }
                  >
                    <Plus size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div className="drawer-empty">
                <Users size={34} />
                <b>{tab === 'friends' ? '新的玩伴，正在路上' : '等待新的玩家加入'}</b>
                <p>邀请朋友打开大厅，一起开启第一局。</p>
              </div>
            )}
          </div>
          <form className="form-stack" onSubmit={addFriend}>
            <label>
              添加好友
              <input
                placeholder="输入玩家 ID"
                value={friendId}
                onChange={(e) => setFriendId(e.target.value)}
              />
            </label>
            <Button variant="outline" type="submit" disabled={!friendId.trim()}>
              <Plus size={16} />
              添加好友
            </Button>
          </form>
          <div className="invite-panel">
            <Sparkles size={20} />
            <h3>收到房间邀请？</h3>
            <p>输入朋友分享的房间码，一键入座。</p>
            <Button
              onClick={() => {
                onOpenChange(false);
                setJoin(true);
              }}
            >
              使用房间码 <DoorIcon />
            </Button>
          </div>
          <div className="announcement">
            <span>PLAYROOM 公告</span>
            <p>UNO、五子棋、中国象棋、斗地主与炸弹猫已开放。邀请朋友，或添加 AI 一起玩。</p>
            <small>好游戏，好朋友，好时光。</small>
          </div>
        </DialogContent>
      </Dialog>
      <JoinRoomDialog open={join} onOpenChange={setJoin} />
    </>
  );
}
function DoorIcon() {
  return <span aria-hidden="true">↗</span>;
}
