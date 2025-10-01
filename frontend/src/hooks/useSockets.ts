// frontend/src/hooks/useGameSocket.ts
import { useEffect } from "react";
import { socketManager } from "../socket";
import { Player } from "./useGameState";

interface UseGameSocketParams {
  playerName: string;
  onJoined: (data: any) => void;
  onRoundNew: (data: { roundNumber: number; waitTimeMs: number }) => void;
  onRoundStart: (data: { roundNumber: number; startTime: number }) => void;
  onRoundCrash: (data: {
    roundNumber: number;
    crashPoint: number;
    crashTime: number;
  }) => void;
  onPlayersUpdate: (players: Player[]) => void;
  onPlayerBet: (data: {
    socketId: string;
    playerName: string;
    amount: number;
    balance: number;
  }) => void;
  onBetResult: (data: {
    success: boolean;
    balance?: number;
    error?: string;
  }) => void;
  onPlayerCashout: (data: {
    socketId: string;
    playerName: string;
    winAmount: number;
    multiplier: number;
  }) => void;
  onCashoutSuccess: (data: { winAmount: number; multiplier: number }) => void;
  onCashoutFailed: (reason: string) => void;
  onJoinError: (error: string) => void;
}

export const useGameSocket = (params: UseGameSocketParams) => {
  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    socketManager.setPlayerName(params.playerName);
    console.log("🔌 Enviando join para:", params.playerName);
    socket.emit("join", params.playerName);

    // Registrar todos los eventos
    socket.on("joined", params.onJoined);
    socket.on("join:error", params.onJoinError);
    socket.on("round:new", params.onRoundNew);
    socket.on("round:start", params.onRoundStart);
    socket.on("round:crash", params.onRoundCrash);
    socket.on("players:update", params.onPlayersUpdate);
    socket.on("player:bet", params.onPlayerBet);
    socket.on("bet:result", params.onBetResult);
    socket.on("player:cashout", params.onPlayerCashout);
    socket.on("cashout:success", params.onCashoutSuccess);
    socket.on("cashout:failed", params.onCashoutFailed);

    // Cleanup
    return () => {
      socket.off("joined");
      socket.off("join:error");
      socket.off("round:new");
      socket.off("round:start");
      socket.off("round:crash");
      socket.off("players:update");
      socket.off("player:bet");
      socket.off("bet:result");
      socket.off("player:cashout");
      socket.off("cashout:success");
      socket.off("cashout:failed");
    };
  }, [params.playerName]);
};
