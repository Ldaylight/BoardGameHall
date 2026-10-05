import type { GameLog } from '../../types.js';
export const kittenKinds = [
  'explode',
  'defuse',
  'attack',
  'skip',
  'shuffle',
  'future',
  'favor',
  'nope',
  'taco',
  'melon',
  'potato',
  'beard',
  'rainbow',
] as const;
export type KittenKind = (typeof kittenKinds)[number];
export interface KittenCard {
  id: string;
  kind: KittenKind;
}
export type KittensAction =
  | { type: 'ek:play'; cardIds: string[]; targetId?: string; requestKind?: KittenKind }
  | { type: 'ek:draw' }
  | { type: 'ek:nope'; cardId: string; pendingId: string }
  | { type: 'ek:allow'; pendingId: string }
  | { type: 'ek:give'; cardId: string }
  | { type: 'ek:defuse'; cardId: string }
  | { type: 'ek:insert'; index: number }
  | { type: 'ek:continue' };
export interface KittenPending {
  id: string;
  playerId: string;
  cards: KittenCard[];
  targetId: string | null;
  requestKind: KittenKind | null;
  nopes: number;
  allowed: string[];
  deadline: number;
}
export interface KittenEvent {
  number: number;
  type: 'play' | 'effect' | 'nope' | 'draw' | 'defuse' | 'insert' | 'explode' | 'give';
  playerId: string;
  kind?: KittenKind;
  cards?: KittenCard[];
  targetId?: string;
  canceled?: boolean;
  count?: number;
}
export type KittensPhase = 'playing' | 'reaction' | 'favor' | 'future' | 'defuse' | 'insert' | 'finished';
export interface KittensState {
  kind: 'exploding-kittens';
  players: string[];
  alive: string[];
  hands: Record<string, KittenCard[]>;
  deck: KittenCard[];
  discard: KittenCard[];
  eliminatedHands: Record<string, KittenCard[]>;
  currentIndex: number;
  phase: KittensPhase;
  turnsRemaining: number;
  underAttack: boolean;
  pending: KittenPending | null;
  favor: { from: string; to: string } | null;
  bomb: KittenCard | null;
  future: KittenCard[];
  futureOwner: string | null;
  winnerId: string | null;
  turnNumber: number;
  turnDeadline: number;
  logs: GameLog[];
  logSequence: number;
  events: KittenEvent[];
}
export interface KittensView extends Omit<
  KittensState,
  'hands' | 'deck' | 'eliminatedHands' | 'bomb' | 'future'
> {
  hand: KittenCard[];
  handCounts: Record<string, number>;
  deckCount: number;
  currentPlayerId: string;
  actorId: string;
  future: KittenCard[];
  hasBomb: boolean;
}
export const kittenInfo: Record<KittenKind, { name: string; caption: string; color: string }> = {
  explode: { name: '炸弹猫', caption: '摸到后必须拆弹，否则淘汰', color: '#ff8067' },
  defuse: { name: '拆弹', caption: '救下自己，将炸弹秘密放回牌堆', color: '#8dd9b6' },
  attack: { name: '攻击', caption: '结束本轮，下一家承担两轮；攻击可叠加', color: '#e9a073' },
  skip: { name: '跳过', caption: '免摸牌，结束一次应承担的回合', color: '#a5ceff' },
  shuffle: { name: '洗牌', caption: '打乱剩余牌堆，让危机重新分布', color: '#bcabef' },
  future: { name: '预知未来', caption: '仅你能查看牌堆顶部三张牌', color: '#cab4fb' },
  favor: { name: '索取', caption: '选一位玩家，由对方决定赠予哪张牌', color: '#f4c58b' },
  nope: { name: '否决', caption: '响应窗口内取消效果；再否决可恢复效果', color: '#f198aa' },
  taco: { name: '卷饼猫', caption: '同名两张随机偷牌，三张可索取指定牌', color: '#e8bc76' },
  melon: { name: '西瓜猫', caption: '同名两张随机偷牌，三张可索取指定牌', color: '#9cdb98' },
  potato: { name: '土豆猫', caption: '同名两张随机偷牌，三张可索取指定牌', color: '#d3b291' },
  beard: { name: '胡子猫', caption: '同名两张随机偷牌，三张可索取指定牌', color: '#a2bdd4' },
  rainbow: { name: '彩虹猫', caption: '同名两张随机偷牌，三张可索取指定牌', color: '#e3ade2' },
};
export const isCat = (kind: KittenKind) => ['taco', 'melon', 'potato', 'beard', 'rainbow'].includes(kind);
export const RESPONSE_MS = 12000;
