export type GameId = 'uno' | 'gomoku' | 'xiangqi' | 'doudizhu' | 'holdem';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Category = 'all' | 'cards' | 'board' | 'strategy';
export interface GameMeta {
  id: GameId;
  name: string;
  subtitle: string;
  category: Exclude<Category, 'all'>;
  minPlayers: number;
  maxPlayers: number;
  supportsAI: boolean;
  supportsMultiplayer: boolean;
  available: boolean;
  accent: string;
  tag: string;
  description: string;
  duration: string;
}
export interface User {
  id: string;
  name: string;
  avatar: string;
  coins: number;
  level: number;
}
export interface Session {
  user: User;
  token: string;
  demo: boolean;
}
export interface Player extends User {
  seat: number;
  ready: boolean;
  isAI: boolean;
  difficulty: Difficulty;
  connected: boolean;
  hasLeft?: boolean;
}
export interface RoomOptions {
  gameId: GameId;
  name: string;
  maxPlayers: number;
  allowSpectators: boolean;
  allowAI: boolean;
  difficulty: Difficulty;
  gomoku?: Partial<import('./games/gomoku/types.js').GomokuOptions>;
}
export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  createdAt: string;
}
export interface GameLog {
  id: string;
  text: string;
  event?: {
    type: 'play' | 'draw' | 'uno' | 'win' | 'pass' | 'penalty' | 'place' | 'draw-game';
    playerId: string;
    value?: import('./games/uno/index.js').Value;
    count?: number;
    uno?: boolean;
  };
}
export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  gameId: GameId;
  maxPlayers: number;
  playerCount: number;
  status: 'waiting' | 'playing' | 'finished';
  allowSpectators: boolean;
}
export type GameView = import('./games/uno/index.js').UnoView | import('./games/gomoku/types.js').GomokuView;
export type GameState =
  import('./games/uno/index.js').UnoState | import('./games/gomoku/types.js').GomokuState;
export type GameAction =
  import('./games/uno/index.js').UnoAction | import('./games/gomoku/types.js').GomokuAction;
export interface RoomView<View extends GameView = GameView> extends RoomSummary {
  hostId: string;
  options: RoomOptions;
  players: Player[];
  chats: ChatMessage[];
  game: View | null;
  revision: number;
  matchId: string | null;
  resultSaved: boolean;
}
export interface ProfileData {
  user: User;
  matches: { id: string; gameName: string; won: boolean; draw?: boolean; createdAt: string; score: number }[];
  friends: User[];
  rankings: { user: User; wins: number; played: number; score: number }[];
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T> = (result: Result<T>) => void;
export interface ClientEvents {
  'room:current': (ack: Ack<RoomView | null>) => void;
  'room:create': (options: RoomOptions, ack: Ack<RoomView>) => void;
  'room:join': (payload: { code: string; spectate?: boolean }, ack: Ack<RoomView>) => void;
  'room:sync': (payload: { roomId: string }, ack: Ack<RoomView>) => void;
  'room:leave': (payload: { roomId: string }, ack: Ack<null>) => void;
  'room:ready': (payload: { roomId: string; ready: boolean }, ack: Ack<null>) => void;
  'room:ai': (payload: { roomId: string; difficulty: Difficulty; removeId?: string }, ack: Ack<null>) => void;
  'room:start': (payload: { roomId: string }, ack: Ack<null>) => void;
  'room:rematch': (payload: { roomId: string }, ack: Ack<null>) => void;
  'game:action': (payload: { roomId: string; action: GameAction; revision: number }, ack: Ack<null>) => void;
  'room:chat': (payload: { roomId: string; text: string }, ack: Ack<null>) => void;
}
export interface ServerEvents {
  'room:state': (room: RoomView) => void;
  'game:state': (room: RoomView) => void;
  'lobby:update': (rooms: RoomSummary[]) => void;
  'presence:update': (users: User[]) => void;
  'server:error': (message: string) => void;
}
