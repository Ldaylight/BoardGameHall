import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Clock3,
  Flame,
  Gamepad2,
  Hash,
  Layers3,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  X,
} from 'lucide-react';
import { games } from '../../../shared/catalog';
import type { Category, GameId, RoomView } from '../../../shared/types';
import { Button } from '@/components/ui/button';
import { GameArt } from '@/components/GameArt';
import { CreateRoomDialog } from '@/components/RoomDialogs';
import { useApp } from '@/stores/app';
import { XiangqiModeDialog } from '@/components/XiangqiModeDialog';
import '../xiangqi.css';
import { perform, request, socket } from '@/lib/api';
const coverTitles: Record<GameId, string> = {
  uno: 'UNO',
  gomoku: 'GOMOKU',
  xiangqi: 'XIANGQI',
  doudizhu: 'DOU DIZHU',
  holdem: 'TEXAS HOLD’EM',
  'exploding-kittens': 'KITTEN CHAOS',
  mahjong: 'MAHJONG',
  billiards: 'BILLIARDS',
};
export function Lobby() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [players, setPlayers] = useState('any');
  const [ai, setAI] = useState(params.get('mode') === 'ai');
  const [multiplayer, setMultiplayer] = useState(false);
  const [sort, setSort] = useState('recommended');
  const [create, setCreate] = useState(false);
  const [xiangqiMode, setXiangqiMode] = useState(false);
  const [gameId, setGameId] = useState<GameId>('uno');
  const [filterOpen, setFilterOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const rooms = useApp((s) => s.rooms);
  const connected = useApp((s) => s.connected);
  useEffect(() => setSlot(document.getElementById('filter-slot')), []);
  useEffect(() => {
    if (params.get('mode') === 'ai') setAI(true);
  }, [params]);
  useEffect(() => {
    if (params.has('q')) setSearch(params.get('q') ?? '');
  }, [params]);
  useEffect(() => {
    const invite = params.get('invite');
    if (invite && connected) {
      setParams({}, { replace: true });
      void perform(async () => {
        const room = await request<RoomView>((ack) => socket.emit('room:join', { code: invite }, ack));
        useApp.getState().setActiveRoom(room);
        navigate(`/room/${room.id}`);
      });
    }
  }, [params, connected, navigate, setParams]);
  const filtered = games.filter(
    (g) =>
      (category === 'all' || g.category === category) &&
      `${g.name} ${g.subtitle}`.toLowerCase().includes(search.toLowerCase()) &&
      (players === 'any' || (g.minPlayers <= Number(players) && g.maxPlayers >= Number(players))) &&
      (!ai || g.supportsAI) &&
      (!multiplayer || g.supportsMultiplayer),
  );
  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  if (sort === 'rooms')
    filtered.sort(
      (a, b) => rooms.filter((r) => r.gameId === b.id).length - rooms.filter((r) => r.gameId === a.id).length,
    );
  function start(id: GameId) {
    setGameId(id);
    if (id === 'xiangqi') setXiangqiMode(true);
    else setCreate(true);
  }
  const filters = (
    <div className="filters">
      <div className="filter-heading">
        <span className="eyebrow">探索游戏</span>
        <SlidersHorizontal size={14} />
      </div>
      {(
        [
          { id: 'all', label: '全部游戏', icon: Gamepad2 },
          { id: 'cards', label: '卡牌派对', icon: Layers3 },
          { id: 'board', label: '经典棋类', icon: Hash },
          { id: 'strategy', label: '策略竞技', icon: Sparkles },
          { id: 'sports', label: '休闲运动', icon: Target },
        ] as const
      ).map((c) => (
        <button
          key={c.id}
          className={`category-link ${category === c.id ? 'active' : ''}`}
          onClick={() => setCategory(c.id)}
        >
          <c.icon size={17} />
          {c.label}
          <span>{c.id === 'all' ? games.length : games.filter((g) => g.category === c.id).length}</span>
        </button>
      ))}
      <div className="filter-heading mt-6">
        <span className="eyebrow">几个人一起？</span>
      </div>
      <div className="player-filter">
        {[
          ['any', '不限'],
          ['2', '2 人'],
          ['3', '3 人'],
          ['4', '4+'],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setPlayers(v)} className={players === v ? 'active' : ''}>
            {l}
          </button>
        ))}
      </div>
      <div className="filter-heading mt-6">
        <span className="eyebrow">你想怎么玩</span>
      </div>
      <label className="filter-check">
        <Bot size={17} />
        <span>支持人机</span>
        <input type="checkbox" checked={ai} onChange={(e) => setAI(e.target.checked)} />
      </label>
      <label className="filter-check">
        <Users size={17} />
        <span>多人联机</span>
        <input type="checkbox" checked={multiplayer} onChange={(e) => setMultiplayer(e.target.checked)} />
      </label>
    </div>
  );
  return (
    <>
      {slot && createPortal(filters, slot)}
      <div className="discovery-heading">
        <div>
          <h2>
            找到你的下一局 <span>FIND YOUR GAME</span>
          </h2>
          <p>经典永不过时，快乐随时开始。</p>
        </div>
        <span className="available-count">
          <i />
          {games.filter((g) => g.available).length} 款已开放体验
        </span>
      </div>
      <div className="game-toolbar">
        <div className="toolbar-tabs">
          {[
            { id: 'all', label: '全部游戏' },
            { id: 'cards', label: '卡牌' },
            { id: 'board', label: '棋类' },
            { id: 'strategy', label: '策略' },
            { id: 'sports', label: '运动' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id as Category)}
              className={category === c.id ? 'active' : ''}
            >
              {c.label}
              {c.id === 'all' && <span>{games.length}</span>}
            </button>
          ))}
        </div>
        <div className="toolbar-controls">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="搜索游戏"
              placeholder="发现好游戏…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label="清除搜索" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <label className="sort-select">
            <ArrowDownUp size={14} />
            <select aria-label="排序方式" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recommended">推荐排序</option>
              <option value="name">名称排序</option>
              <option value="rooms">房间数量</option>
            </select>
          </label>
          <button
            className="filter-mobile icon-button"
            onClick={() => setFilterOpen(!filterOpen)}
            aria-label="筛选"
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </div>
      {filterOpen && <div className="mobile-filter-panel">{filters}</div>}
      <div className="games-grid">
        {filtered.map((g, i) => (
          <motion.article
            key={g.id}
            className={`game-tile ${g.available ? 'available' : ''}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <div className={`tile-cover cover-${g.id}`}>
              <span className="tile-tag">
                {g.id === 'uno' && <Flame size={12} />} {g.tag}
              </span>
              <span className="tile-index">0{games.findIndex((v) => v.id === g.id) + 1}</span>
              <GameArt game={g.id} />
              <div className="cover-title">
                {coverTitles[g.id]}
                <span>{g.subtitle}</span>
              </div>
            </div>
            <div className="tile-info">
              <div className="tile-title">
                <h3>{g.name}</h3>
                {g.available ? (
                  <span className="room-counter">
                    <i />
                    {rooms.filter((r) => r.gameId === g.id && r.status === 'waiting').length} 个房间
                  </span>
                ) : (
                  <span className="coming-label">即将上线</span>
                )}
              </div>
              <div className="tile-meta">
                <span>
                  <Users size={13} />
                  {g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`} 人
                </span>
                <i />
                <span>
                  <Clock3 size={13} />
                  {g.duration}
                </span>
              </div>
              <div className="tile-bottom">
                <div className="mode-badges">
                  {g.supportsMultiplayer && (
                    <span>
                      <Users size={11} />
                      多人
                    </span>
                  )}
                  {g.supportsAI && (
                    <span>
                      <Bot size={11} />
                      人机
                    </span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={`tile-play ${g.available ? '' : 'disabled'}`}
                  disabled={!g.available}
                  onClick={() => start(g.id)}
                >
                  {g.available ? '开始游戏' : '敬请期待'}
                  {g.available && <ArrowUpRight size={16} />}
                </Button>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Search size={32} />
          <h3>还没有找到这款游戏</h3>
          <p>试试其他关键词，或清除筛选条件。</p>
          <Button
            variant="outline"
            onClick={() => {
              setSearch('');
              setCategory('all');
              setPlayers('any');
              setAI(false);
              setMultiplayer(false);
            }}
          >
            清除筛选
          </Button>
        </div>
      )}
      <section className="open-rooms">
        <div className="section-heading">
          <h2>
            空位已留，等你入座 <span>OPEN TABLES</span>
          </h2>
          <span className="eyebrow">实时房间 {rooms.filter((r) => r.status === 'waiting').length}</span>
        </div>
        {rooms.filter((r) => r.status !== 'finished').length ? (
          <div className="room-list">
            {rooms
              .filter((r) => r.status !== 'finished')
              .map((r) => (
                <div className="room-list-row" key={r.id}>
                  <div className="room-game-icon">
                    <Layers3 size={21} />
                  </div>
                  <span>
                    <b>{r.name}</b>
                    <small>
                      {r.code} · {r.status === 'playing' ? '对局进行中' : '等待开局'}
                    </small>
                  </span>
                  <span className="room-seats">
                    <Users size={15} />
                    {r.playerCount}/{r.maxPlayers}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={r.status === 'playing' && !r.allowSpectators}
                    onClick={() =>
                      void perform(async () => {
                        const room = await request<RoomView>((ack) =>
                          socket.emit('room:join', { code: r.code, spectate: r.status === 'playing' }, ack),
                        );
                        useApp.getState().setActiveRoom(room);
                        navigate(`/room/${room.id}`);
                      })
                    }
                  >
                    {r.status === 'playing' ? '观战' : '加入'}
                    <ArrowRight size={14} />
                  </Button>
                </div>
              ))}
          </div>
        ) : (
          <div className="rooms-empty">
            <div>
              <span className="empty-table-icon">
                <Gamepad2 size={22} />
              </span>
              <span>
                <strong>第一张牌桌，由你来开</strong>
                <p>创建一个房间，邀请朋友或 AI 一起玩。</p>
              </span>
            </div>
            <button onClick={() => start('uno')}>
              创建房间 <Plus size={16} />
            </button>
          </div>
        )}
      </section>
      <div className="lobby-bottom">
        <span>✦</span>
        <p>不必很厉害，也能玩得很开心。</p>
        <span>GOOD GAMES. GREAT COMPANY.</span>
      </div>
      <CreateRoomDialog
        key={`${gameId}-${create}`}
        open={create}
        onOpenChange={setCreate}
        initialGame={gameId}
      />
      <XiangqiModeDialog
        open={xiangqiMode}
        onOpenChange={setXiangqiMode}
        onStandard={() => setCreate(true)}
      />
    </>
  );
}
