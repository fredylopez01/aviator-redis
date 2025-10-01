// types/player.types.ts
export interface Player {
  id: string;
  name: string;
  balance: number;
  bet: number;
  cashedOut: boolean;
  win: number;
}

// types/game.types.ts
export type RoundState = "waiting" | "running" | "crashed";

export interface GameState {
  round: {
    state: RoundState;
    roundNumber: number;
    startTime?: number;
  };
  players: Player[];
}

export interface RoundNewData {
  roundNumber: number;
  waitTimeMs: number;
}

export interface RoundStartData {
  roundNumber: number;
  startTime: number;
}

export interface RoundCrashData {
  roundNumber: number;
  crashPoint: number;
  crashTime: number;
}

export interface PlayerBetData {
  socketId: string;
  playerName: string;
  amount: number;
  balance: number;
}

export interface BetResultData {
  success: boolean;
  balance?: number;
  error?: string;
}

export interface PlayerCashoutData {
  socketId: string;
  playerName: string;
  winAmount: number;
  multiplier: number;
}

export interface CashoutSuccessData {
  winAmount: number;
  multiplier: number;
}

export interface JoinedData {
  player?: Player;
  gameState?: GameState;
}
