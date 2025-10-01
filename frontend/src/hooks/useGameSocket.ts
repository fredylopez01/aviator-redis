import { useEffect, useRef } from "react";
import { socketManager } from "../services/socketManager";
import type {
  Player,
  JoinedData,
  RoundNewData,
  RoundStartData,
  RoundCrashData,
  PlayerBetData,
  BetResultData,
  PlayerCashoutData,
  CashoutSuccessData,
} from "../types/types";

interface UseGameSocketParams {
  playerName: string;
  onJoined: (data: JoinedData) => void;
  onJoinError: (error: string) => void;
  onRoundNew: (data: RoundNewData) => void;
  onRoundStart: (data: RoundStartData) => void;
  onRoundCrash: (data: RoundCrashData) => void;
  onPlayersUpdate: (players: Player[]) => void;
  onPlayerBet: (data: PlayerBetData) => void;
  onBetResult: (data: BetResultData) => void;
  onPlayerCashout: (data: PlayerCashoutData) => void;
  onCashoutSuccess: (data: CashoutSuccessData) => void;
  onCashoutFailed: (reason: string) => void;
}

export const useGameSocket = (params: UseGameSocketParams) => {
  const {
    playerName,
    onJoined,
    onJoinError,
    onRoundNew,
    onRoundStart,
    onRoundCrash,
    onPlayersUpdate,
    onPlayerBet,
    onBetResult,
    onPlayerCashout,
    onCashoutSuccess,
    onCashoutFailed,
  } = params;

  // Ref para evitar múltiples conexiones
  const isConnecting = useRef(false);
  const hasJoined = useRef(false);

  useEffect(() => {
    // Evitar múltiples ejecuciones
    if (isConnecting.current) {
      console.log("⚠️ Ya hay una conexión en progreso, ignorando...");
      return;
    }

    isConnecting.current = true;

    // Conectar socket UNA SOLA VEZ
    const socket = socketManager.connect();

    const handleConnect = () => {
      console.log("✅ Socket conectado:", socket.id);

      // Enviar join solo una vez por sesión
      if (!hasJoined.current) {
        console.log("🔌 Enviando join para:", playerName);
        socketManager.setPlayerName(playerName);
        socket.emit("join", playerName);
        hasJoined.current = true;
      }
    };

    // Si ya está conectado, enviar join inmediatamente
    if (socket.connected) {
      handleConnect();
    } else {
      // Si no, esperar a que se conecte
      socket.on("connect", handleConnect);
    }

    // Registrar eventos
    socket.on("joined", onJoined);
    socket.on("join:error", onJoinError);
    socket.on("round:new", onRoundNew);
    socket.on("round:start", onRoundStart);
    socket.on("round:crash", onRoundCrash);
    socket.on("players:update", onPlayersUpdate);
    socket.on("player:bet", onPlayerBet);
    socket.on("bet:result", onBetResult);
    socket.on("player:cashout", onPlayerCashout);
    socket.on("cashout:success", onCashoutSuccess);
    socket.on("cashout:failed", onCashoutFailed);

    // Cleanup
    return () => {
      console.log("🧹 Limpiando listeners del socket");
      socket.off("connect", handleConnect);
      socket.off("joined", onJoined);
      socket.off("join:error", onJoinError);
      socket.off("round:new", onRoundNew);
      socket.off("round:start", onRoundStart);
      socket.off("round:crash", onRoundCrash);
      socket.off("players:update", onPlayersUpdate);
      socket.off("player:bet", onPlayerBet);
      socket.off("bet:result", onBetResult);
      socket.off("player:cashout", onPlayerCashout);
      socket.off("cashout:success", onCashoutSuccess);
      socket.off("cashout:failed", onCashoutFailed);

      isConnecting.current = false;
    };
  }, []); // Sin dependencias para que se ejecute UNA SOLA VEZ

  // Effect separado para actualizar callbacks
  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    // Re-registrar solo los handlers cuando cambien
    socket.off("joined").on("joined", onJoined);
    socket.off("join:error").on("join:error", onJoinError);
    socket.off("round:new").on("round:new", onRoundNew);
    socket.off("round:start").on("round:start", onRoundStart);
    socket.off("round:crash").on("round:crash", onRoundCrash);
    socket.off("players:update").on("players:update", onPlayersUpdate);
    socket.off("player:bet").on("player:bet", onPlayerBet);
    socket.off("bet:result").on("bet:result", onBetResult);
    socket.off("player:cashout").on("player:cashout", onPlayerCashout);
    socket.off("cashout:success").on("cashout:success", onCashoutSuccess);
    socket.off("cashout:failed").on("cashout:failed", onCashoutFailed);
  }, [
    onJoined,
    onJoinError,
    onRoundNew,
    onRoundStart,
    onRoundCrash,
    onPlayersUpdate,
    onPlayerBet,
    onBetResult,
    onPlayerCashout,
    onCashoutSuccess,
    onCashoutFailed,
  ]);
};
