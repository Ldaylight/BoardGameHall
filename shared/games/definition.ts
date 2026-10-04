import type { Difficulty, GameId } from '../types.js';
export interface GameDefinition<State, Action, View, Options = undefined> {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  createState: (playerIds: string[], options?: Options) => State;
  applyAction: (state: State, playerId: string, action: Action) => State;
  getLegalActions: (view: View, playerId: string) => Action[];
  aiMove: (view: View, playerId: string, difficulty: Difficulty) => Action;
  getView: (state: State, playerId: string | null) => View;
}
