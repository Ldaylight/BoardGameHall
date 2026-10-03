import type { Difficulty, GameLog } from '../../types.js';
import type { GameDefinition } from '../definition.js';
export type Color = 'red' | 'yellow' | 'green' | 'blue';
export type Value =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export interface Card {
  id: string;
  color: Color | 'wild';
  value: Value;
}
export type UnoAction =
  | { type: 'play'; cardId: string; color?: Color; uno?: boolean }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'uno' };
export interface UnoDeclaration {
  playerId: string;
  turnNumber: number;
}
export interface PublicPlay {
  card: Card;
  color: Color;
  turnNumber: number;
}
export interface UnoState {
  players: string[];
  hands: Record<string, Card[]>;
  deck: Card[];
  discard: Card[];
  lastPlays: Record<string, PublicPlay>;
  unoDeclared: UnoDeclaration | null;
  currentIndex: number;
  direction: 1 | -1;
  color: Color;
  winnerId: string | null;
  drawnCardId: string | null;
  logs: GameLog[];
  turnDeadline: number;
  turnNumber: number;
}
export interface UnoView {
  players: string[];
  hand: Card[];
  handCounts: Record<string, number>;
  topCard: Card;
  lastPlays: Record<string, PublicPlay>;
  unoDeclared: UnoDeclaration | null;
  deckCount: number;
  currentPlayerId: string;
  direction: 1 | -1;
  color: Color;
  winnerId: string | null;
  drawnCardId: string | null;
  logs: GameLog[];
  turnDeadline: number;
  turnNumber: number;
}
export const colors: Color[] = ['red', 'yellow', 'green', 'blue'];
export const colorNames: Record<Color, string> = { red: '红色', yellow: '黄色', green: '绿色', blue: '蓝色' };
export function cardLabel(card: Pick<Card, 'value'>) {
  return (
    ({ skip: '⊘', reverse: '⇄', draw2: '+2', wild: '✦', wild4: '+4' } as Partial<Record<Value, string>>)[
      card.value
    ] ?? card.value
  );
}
function shuffle<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function buildDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (const color of colors) {
    deck.push({ id: `c${id++}`, color, value: '0' });
    for (const value of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'] as Value[])
      for (let i = 0; i < 2; i++) deck.push({ id: `c${id++}`, color, value });
  }
  for (const value of ['wild', 'wild4'] as Value[])
    for (let i = 0; i < 4; i++) deck.push({ id: `c${id++}`, color: 'wild', value });
  return shuffle(deck);
}
function drawCards(state: UnoState, player: string, n: number) {
  for (let i = 0; i < n; i++) {
    if (!state.deck.length && state.discard.length > 1) {
      const top = state.discard.pop()!;
      state.deck = shuffle(state.discard);
      state.discard = [top];
    }
    const card = state.deck.pop();
    if (card) state.hands[player].push(card);
  }
}
function log(state: UnoState, text: string) {
  state.logs.push({ id: `${state.turnNumber}-${state.logs.length}`, text });
  state.logs = state.logs.slice(-60);
}
function createState(players: string[]): UnoState {
  if (players.length < 2 || players.length > 6 || new Set(players).size !== players.length)
    throw new Error('UNO 需要 2–6 名不同的玩家');
  const deck = buildDeck();
  const hands: Record<string, Card[]> = {};
  for (const p of players) hands[p] = deck.splice(0, 7);
  const topIndex = deck.findIndex((c) => c.color !== 'wild' && /^\d$/.test(c.value));
  const top = deck.splice(topIndex, 1)[0];
  return {
    players: [...players],
    hands,
    deck,
    discard: [top],
    lastPlays: {},
    unoDeclared: null,
    currentIndex: 0,
    direction: 1,
    color: top.color as Color,
    winnerId: null,
    drawnCardId: null,
    logs: [{ id: 'start', text: '每人 7 张手牌，牌局开始！' }],
    turnDeadline: Date.now() + 45000,
    turnNumber: 0,
  };
}
function getView(s: UnoState, playerId: string | null): UnoView {
  return {
    players: [...s.players],
    hand: playerId ? structuredClone(s.hands[playerId] ?? []) : [],
    handCounts: Object.fromEntries(s.players.map((p) => [p, s.hands[p].length])),
    topCard: { ...s.discard[s.discard.length - 1] },
    // Public history only; no opponent hands or deck information is exposed.
    lastPlays: structuredClone(
      Object.fromEntries(
        Object.entries(s.lastPlays ?? {})
          .sort((a, b) => b[1].turnNumber - a[1].turnNumber)
          .slice(0, 2),
      ),
    ),
    unoDeclared: s.unoDeclared ? { ...s.unoDeclared } : null,
    deckCount: s.deck.length,
    currentPlayerId: s.players[s.currentIndex],
    direction: s.direction,
    color: s.color,
    winnerId: s.winnerId,
    drawnCardId: playerId === s.players[s.currentIndex] ? s.drawnCardId : null,
    logs: structuredClone(s.logs),
    turnDeadline: s.turnDeadline,
    turnNumber: s.turnNumber,
  };
}
function getLegalActions(view: UnoView, playerId: string): UnoAction[] {
  if (view.winnerId || view.currentPlayerId !== playerId || !view.players.includes(playerId)) return [];
  const playable = view.hand.filter(
    (c) =>
      (!view.drawnCardId || c.id === view.drawnCardId) &&
      (c.color === view.color || c.value === view.topCard.value || c.color === 'wild') &&
      (c.value !== 'wild4' || !view.hand.some((h) => h.color === view.color)),
  );
  const actions: UnoAction[] = playable.flatMap((c) =>
    c.color === 'wild'
      ? colors.map((color) => ({ type: 'play' as const, cardId: c.id, color, uno: view.hand.length === 2 }))
      : [{ type: 'play' as const, cardId: c.id, uno: view.hand.length === 2 }],
  );
  actions.push(view.drawnCardId ? { type: 'pass' } : { type: 'draw' });
  if (
    view.hand.length === 2 &&
    !(view.unoDeclared?.playerId === playerId && view.unoDeclared.turnNumber === view.turnNumber)
  )
    actions.push({ type: 'uno' });
  return actions;
}
function advance(s: UnoState, steps = 1) {
  s.currentIndex = (s.currentIndex + s.direction * steps + s.players.length * steps) % s.players.length;
  s.drawnCardId = null;
  s.unoDeclared = null;
  s.turnNumber++;
  s.turnDeadline = Date.now() + 45000;
}
function applyAction(input: UnoState, playerId: string, action: UnoAction): UnoState {
  const legal = getLegalActions(getView(input, playerId), playerId);
  if (
    !legal.some(
      (a) =>
        a.type === action.type &&
        (a.type !== 'play' ||
          (action.type === 'play' && a.cardId === action.cardId && a.color === action.color)),
    )
  )
    throw new Error('不是合法动作，请按当前颜色或数字出牌');
  const s = structuredClone(input);
  if (action.type === 'uno') {
    s.unoDeclared = { playerId, turnNumber: s.turnNumber };
    log(s, 'UNO！已声明，将打出倒数第二张牌。');
    return s;
  }
  if (action.type === 'draw') {
    s.unoDeclared = null;
    const before = s.hands[playerId].length;
    drawCards(s, playerId, 1);
    const drawn = s.hands[playerId].at(-1);
    log(s, '当前玩家摸了一张牌');
    if (s.hands[playerId].length > before && drawn) {
      s.drawnCardId = drawn.id;
      if (getLegalActions(getView(s, playerId), playerId).some((a) => a.type === 'play')) {
        s.turnDeadline = Date.now() + 45000;
        return s;
      }
    }
    advance(s);
    return s;
  }
  if (action.type === 'pass') {
    log(s, '当前玩家结束回合');
    advance(s);
    return s;
  }
  const index = s.hands[playerId].findIndex((c) => c.id === action.cardId);
  const card = s.hands[playerId].splice(index, 1)[0];
  s.discard.push(card);
  s.color = card.color === 'wild' ? action.color! : card.color;
  s.lastPlays ??= {};
  s.lastPlays[playerId] = { card: { ...card }, color: s.color, turnNumber: s.turnNumber };
  s.lastPlays = Object.fromEntries(
    Object.entries(s.lastPlays)
      .sort((a, b) => b[1].turnNumber - a[1].turnNumber)
      .slice(0, 2),
  );
  log(s, `打出 ${colorNames[s.color]} ${cardLabel(card)}`);
  let steps = 1;
  if (card.value === 'reverse') {
    s.direction = s.direction === 1 ? -1 : 1;
    if (s.players.length === 2) steps = 2;
  }
  if (card.value === 'skip') steps = 2;
  if (card.value === 'draw2' || card.value === 'wild4') {
    const next = (s.currentIndex + s.direction + s.players.length) % s.players.length;
    const count = card.value === 'draw2' ? 2 : 4;
    drawCards(s, s.players[next], count);
    steps = 2;
    log(s, `下一位玩家摸 ${count} 张并跳过回合`);
  }
  if (s.hands[playerId].length === 1) {
    if (action.uno || (s.unoDeclared?.playerId === playerId && s.unoDeclared.turnNumber === s.turnNumber))
      log(s, 'UNO！只剩最后一张！');
    else {
      drawCards(s, playerId, 2);
      log(s, '忘记喊 UNO，罚摸 2 张');
    }
  }
  if (s.hands[playerId].length === 0) {
    s.winnerId = playerId;
    log(s, '手牌已清空，牌局结束！');
  }
  advance(s, steps);
  return s;
}
function aiMove(view: UnoView, playerId: string, difficulty: Difficulty): UnoAction {
  // This function only receives the same private view as a human, never the deck or other hands.
  const legal = getLegalActions(view, playerId);
  if (!legal.length) throw new Error('AI 无合法动作');
  if (difficulty === 'easy') return legal[Math.floor(Math.random() * legal.length)];
  const counts = Object.fromEntries(
    colors.map((c) => [c, view.hand.filter((h) => h.color === c).length]),
  ) as Record<Color, number>;
  const ranked = legal
    .map((action) => {
      if (action.type !== 'play') return { action, score: -100 };
      const card = view.hand.find((c) => c.id === action.cardId)!;
      const next =
        view.players[
          (view.players.indexOf(playerId) + view.direction + view.players.length) % view.players.length
        ];
      const pressure = view.handCounts[next] <= 2 ? 12 : 3;
      return {
        action,
        score:
          (card.value === 'draw2' || card.value === 'wild4' || card.value === 'skip' ? pressure : 0) +
          (card.color === 'wild' ? -4 : counts[card.color]) +
          (action.color ? counts[action.color] : 0),
      };
    })
    .sort((a, b) => b.score - a.score);
  // Hard is an explicit extension point; currently uses the medium heuristic, no hidden information.
  return ranked[0].action;
}
export const uno: GameDefinition<UnoState, UnoAction, UnoView> = {
  id: 'uno',
  name: 'UNO',
  minPlayers: 2,
  maxPlayers: 6,
  createState,
  applyAction,
  getLegalActions,
  aiMove,
  getView,
};
