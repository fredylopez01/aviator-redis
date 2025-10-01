import { useState, useCallback } from "react";
import { Player, RoundState } from "../types/types";

export const useGameState = () => {
  const [roundState, setRoundState] = useState<RoundState>("waiting");
  const [roundNumber, setRoundNumber] = useState<number>(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [message, setMessage] = useState<string>("");
  const [gameInitialized, setGameInitialized] = useState<boolean>(false);

  const resetPlayerBets = useCallback(() => {
    if (currentPlayer) {
      setCurrentPlayer({
        ...currentPlayer,
        bet: 0,
        cashedOut: false,
        win: 0,
      });
    }
  }, [currentPlayer]);

  const updateCurrentPlayerFromList = useCallback(
    (socketId: string) => {
      const player = players.find((p) => p.id === socketId);
      if (player) {
        console.log("🔄 Actualizando currentPlayer desde lista:", player);
        setCurrentPlayer(player);
      }
    },
    [players]
  );

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
    updateCurrentPlayerFromList,
  };
};
