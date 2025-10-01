// frontend/src/hooks/useGameState.ts
import { useState } from "react";

export interface Player {
  id: string;
  name: string;
  balance: number;
  bet: number;
  cashedOut: boolean;
  win: number;
}

interface UseGameStateReturn {
  roundState: string;
  setRoundState: (state: string) => void;
  roundNumber: number;
  setRoundNumber: (num: number) => void;
  players: Player[];
  setPlayers: (players: Player[]) => void;
  currentPlayer: Player | null;
  setCurrentPlayer: (player: Player | null) => void;
  message: string;
  setMessage: (msg: string) => void;
  gameInitialized: boolean;
  setGameInitialized: (init: boolean) => void;
  resetPlayerBets: () => void;
}

export const useGameState = (): UseGameStateReturn => {
  const [roundState, setRoundState] = useState<string>("waiting");
  const [roundNumber, setRoundNumber] = useState<number>(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [message, setMessage] = useState<string>("");
  const [gameInitialized, setGameInitialized] = useState<boolean>(false);

  // Resetea las apuestas del jugador actual para nueva ronda
  const resetPlayerBets = () => {
    if (currentPlayer) {
      setCurrentPlayer({
        ...currentPlayer,
        bet: 0,
        cashedOut: false,
        win: 0,
      });
    }
  };

  return {
    roundState,
    setRoundState,
    roundNumber,
    setRoundNumber,
    players,
    setPlayers,
    currentPlayer,
    setCurrentPlayer,
    message,
    setMessage,
    gameInitialized,
    setGameInitialized,
    resetPlayerBets,
  };
};
