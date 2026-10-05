import { describe, expect, it } from 'vitest';
import { GameAudioTracker, eventCues } from '../client/src/lib/game-audio';
import { defaultAudio, normalizeAudio } from '../client/src/lib/audio-settings';
import { uno } from '../shared/games/uno';
import type { RoomView } from '../shared/types';
import { xiangqiTimelines } from '../client/src/lib/xiangqi-timeline';
import { doudizhu } from '../shared/games/doudizhu';
import { holdem } from '../shared/games/holdem';

function room(): RoomView {
  const state = uno.createState(['a', 'b']);
  return {
    id: 'r',
    code: 'ABC123',
    name: 'Audio test',
    gameId: 'uno',
    maxPlayers: 2,
    playerCount: 2,
    status: 'playing',
    allowSpectators: true,
    hostId: 'a',
    options: {
      gameId: 'uno',
      name: 'Audio test',
      maxPlayers: 2,
      allowSpectators: true,
      allowAI: true,
      difficulty: 'medium',
    },
    players: [],
    chats: [],
    game: uno.getView(state, 'a'),
    revision: 1,
    matchId: 'match-1',
    resultSaved: false,
  };
}

describe('audio preferences and public events', () => {
  it('poker effects follow accepted public events once, with final win distinct from hand payouts', () => {
    let s = holdem.createState(['a', 'b']);
    s.street = 'river';
    s.community = [2, 4, 7, 9, 11].map((rank, i) => ({
      rank,
      suit: i % 2 ? 'hearts' : 'spades',
      id: `public${i}`,
    }));
    s.hands.a = [
      { rank: 14, suit: 'clubs', id: 'a1' },
      { rank: 14, suit: 'diamonds', id: 'a2' },
    ];
    s.hands.b = [
      { rank: 13, suit: 'clubs', id: 'b1' },
      { rank: 13, suit: 'diamonds', id: 'b2' },
    ];
    const r = room();
    r.gameId = 'holdem';
    r.game = holdem.getView(s, 'a');
    const tracker = new GameAudioTracker();
    expect(tracker.update(r, true, 'a')).toEqual([{ effect: 'deal' }]);
    s = holdem.applyAction(s, 'a', { type: 'poker:all-in' });
    r.game = holdem.getView(s, 'a');
    expect(tracker.update(r, true, 'a')).toEqual([{ effect: 'poker-all-in' }]);
    s = holdem.applyAction(s, 'b', { type: 'poker:call' });
    r.game = holdem.getView(s, 'a');
    expect(tracker.update(r, true, 'a')).toEqual([
      { effect: 'poker-chip' },
      { effect: 'poker-payout' },
      { effect: 'win', delay: 0.6 },
    ]);
    expect(tracker.update(structuredClone(r), true, 'a')).toEqual([]);
    tracker.update(r, false, 'a');
    expect(tracker.update(r, true, 'a')).toEqual([]);
  });
  it('joker laughter occurs only on accepted +2/+4 play events, once after server acknowledgement', () => {
    const view = room(),
      tracker = new GameAudioTracker();
    tracker.update(view, true, 'a');
    for (const value of ['draw2', 'wild4'] as const) {
      view.game!.logs.push({ id: value, text: 'accepted', event: { type: 'play', playerId: 'b', value } });
      expect(tracker.update(view, true, 'a').filter((c) => c.effect === 'joker-laugh')).toHaveLength(1);
      expect(tracker.update(structuredClone(view), true, 'a')).toEqual([]);
    }
    expect(eventCues({ type: 'draw', playerId: 'a', count: 4 }).some((c) => c.effect === 'joker-laugh')).toBe(
      false,
    );
    expect(eventCues({ type: 'uno', playerId: 'a' })).toEqual([]);
    tracker.update(view, false, 'a');
    view.game!.logs.push({
      id: 'missed',
      text: 'history',
      event: { type: 'play', playerId: 'b', value: 'wild4' },
    });
    expect(tracker.update(view, true, 'a')).toEqual([]);
  });
  it('a farmer hears victory when the teammate finishes; Doudizhu special combinations have distinct sounds', () => {
    const view = room();
    view.gameId = 'doudizhu';
    view.game = doudizhu.getView(doudizhu.createState(['a', 'b', 'c']), 'b');
    const tracker = new GameAudioTracker();
    tracker.update(view, true, 'b');
    view.game.winnerId = 'c';
    view.game.winnerIds = ['b', 'c'];
    view.game.logs.push({ id: 'team-end', text: 'team wins', event: { type: 'ddz-win', playerId: 'c' } });
    expect(tracker.update(view, true, 'b')).toEqual([{ effect: 'win', delay: 0.3 }]);
    for (const combo of ['bomb', 'rocket', 'plane-single'] as const)
      expect(eventCues({ type: 'ddz-play', playerId: 'a', combo }).map((c) => c.effect)).toEqual([
        'play',
        combo === 'plane-single' ? 'ddz-plane' : `ddz-${combo}`,
      ]);
  });
  it('all seven Xiangqi pieces have distinct movement/capture sounds with impact and check timing', () => {
    for (const piece of [
      'general',
      'advisor',
      'elephant',
      'horse',
      'chariot',
      'cannon',
      'soldier',
    ] as const) {
      expect(eventCues({ type: 'xiangqi-move', playerId: 'a', piece })).toEqual([
        { effect: `x-${piece}-move` },
      ]);
      expect(eventCues({ type: 'xiangqi-move', playerId: 'a', piece, capture: true, check: true })).toEqual([
        { effect: `x-${piece}-move` },
        { effect: `x-${piece}-capture` },
        { effect: `x-${piece}-impact`, delay: xiangqiTimelines[piece].impact },
        { effect: 'x-check', delay: xiangqiTimelines[piece].impact + 0.12 },
      ]);
    }
  });
  it('plays stone placement through public logs and keeps a full-board draw silent', () => {
    expect(eventCues({ type: 'place', playerId: 'a' }, 'a')).toEqual([{ effect: 'stone' }]);
    expect(eventCues({ type: 'draw-game', playerId: '' }, 'a')).toEqual([]);
  });
  it('recovers corrupted settings and clamps unsafe volume / rejects unknown track IDs', () => {
    expect(normalizeAudio(null)).toEqual(defaultAudio);
    expect(
      normalizeAudio({
        musicVolume: 8,
        effectsVolume: -1,
        muted: 'yes',
        lobbyTrack: 'javascript:evil',
        gameTrack: 'game-orbit',
      }),
    ).toEqual({ ...defaultAudio, musicVolume: 1, effectsVolume: 0, gameTrack: 'game-orbit' });
    expect(normalizeAudio({ musicVolume: NaN }).musicVolume).toBe(defaultAudio.musicVolume);
  });
  it('gives special cards distinct cues and keeps draw / UNO / penalties separate', () => {
    for (const value of ['skip', 'reverse', 'draw2', 'wild', 'wild4'] as const) {
      expect(eventCues({ type: 'play', playerId: 'b', value }).map((c) => c.effect)).toEqual([
        'play',
        value,
        ...(['draw2', 'wild4'].includes(value) ? ['joker-laugh'] : []),
      ]);
    }
    expect(eventCues({ type: 'play', playerId: 'b', value: '3' })).toEqual([{ effect: 'play' }]);
    expect(eventCues({ type: 'draw', playerId: 'b', count: 0 })).toEqual([]);
    expect(eventCues({ type: 'uno', playerId: 'b' })).toEqual([]);
    expect(eventCues({ type: 'play', playerId: 'b', value: '3', uno: true }).map((c) => c.effect)).toEqual([
      'play',
      'uno',
    ]);
    expect(eventCues({ type: 'win', playerId: 'a' }, 'a')[0].effect).toBe('win');
    expect(eventCues({ type: 'penalty', playerId: 'b', count: 2 }).map((c) => c.effect)).toEqual([
      'penalty',
      'draw',
      'draw',
    ]);
  });
  it('plays fresh remote actions once, without replaying reconnect or chat snapshots', () => {
    const view = room(),
      tracker = new GameAudioTracker();
    expect(tracker.update(view, true, 'a')).toEqual([{ effect: 'deal' }]);
    expect(tracker.update(view, true, 'a')).toEqual([]);
    view.game!.logs.push({ id: '1', text: 'Public draw', event: { type: 'draw', playerId: 'b', count: 1 } });
    expect(tracker.update(view, true, 'a').map((c) => c.effect)).toEqual(['draw']);
    expect(tracker.update(structuredClone(view), true, 'a')).toEqual([]);
    tracker.update(view, false, 'a');
    view.game!.logs.push({ id: '2', text: 'Missed UNO', event: { type: 'uno', playerId: 'b' } });
    expect(tracker.update(view, true, 'a')).toEqual([]);
    view.game!.logs.push({
      id: '3',
      text: 'Live UNO',
      event: { type: 'play', playerId: 'a', value: '3', uno: true },
    });
    expect(tracker.update(view, true, 'a').map((c) => c.effect)).toEqual(['play', 'uno']);
  });
  it('ticks once per displayed second, escalates the last 5 seconds and stops on finish / disconnect', () => {
    const view = room(),
      tracker = new GameAudioTracker();
    view.game!.turnDeadline = 100000;
    expect(tracker.countdown(view, 90000, true)).toEqual([]);
    expect(tracker.countdown(view, 91000, true)).toEqual([{ effect: 'tick' }]);
    expect(tracker.countdown(view, 91020, true)).toEqual([]);
    expect(tracker.countdown(view, 95000, true)).toEqual([{ effect: 'urgent' }]);
    expect(tracker.countdown(view, 97000, false)).toEqual([]);
    expect(tracker.countdown(view, 98000, true)).toEqual([]);
    view.game!.winnerId = 'a';
    expect(tracker.countdown(view, 99000, true)).toEqual([]);
  });
  it('server declaration emits one voice event; public logs never contain hidden drawn cards', () => {
    const state = uno.createState(['a', 'b']);
    state.hands.a = [
      { id: 'test-red', value: '5', color: 'red' },
      { id: 'test-green', value: '7', color: 'green' },
    ];
    state.color = 'red';
    const called = uno.applyAction(state, 'a', { type: 'uno' });
    const played = uno.applyAction(called, 'a', { type: 'play', cardId: 'test-red' });
    expect(played.logs.filter((log) => log.event?.type === 'uno')).toHaveLength(1);
    expect(eventCues(called.logs.at(-1)!.event)).toEqual([]);
    expect(played.logs.find((log) => log.event?.type === 'play')!.event?.uno).toBe(true);
    const drawn = uno.applyAction(state, 'a', { type: 'draw' });
    const event = uno.getView(drawn, 'b').logs.find((log) => log.event?.type === 'draw')!.event!;
    expect(event).toEqual({ type: 'draw', playerId: 'a', count: 1 });
  });
  it('logs keep unique IDs even when 60 retained events receive several actions in the same turn', () => {
    const state = uno.createState(['a', 'b']);
    state.hands.a = [
      { id: 'a-red', value: '5', color: 'red' },
      { id: 'a-green', value: '7', color: 'green' },
    ];
    state.logs = Array.from({ length: 60 }, (_, i) => ({ id: `legacy-${i}`, text: 'old log' }));
    state.logSequence = 60;
    const called = uno.applyAction(state, 'a', { type: 'uno' });
    const drawn = uno.applyAction(called, 'a', { type: 'draw' });
    expect(drawn.logs).toHaveLength(60);
    expect(new Set(drawn.logs.map((log) => log.id)).size).toBe(60);
    expect(drawn.logs.at(-1)!.id).not.toBe(drawn.logs.at(-2)!.id);
  });
});
