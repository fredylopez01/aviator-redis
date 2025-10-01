import { useCallback, useEffect } from "react";
import { socketManager } from "../../services/socketManager";
import {
  useGameState,
  useMultiplier,
  useGameSocket,
  useMessageTimeout,
} from "../../hooks";
import { Controls } from "../Controls/Controls";
import { PlayerList } from "../PlayerList/PlayerList";
import { MultiplierDisplay } from "../Multiplier/MultiplierDisplay";
import { PlayerInfo } from "../PlayerInfo/PlayerInfo";
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
} from "../../types/types";

interface GameProps {
  player: { name: string };
}

export const Game = ({ player }: GameProps) => {
  const gameState = useGameState();
  const multiplierState = useMultiplier();

  const handleClearMessage = useCallback(() => {
    gameState.setMessage("");
  }, [gameState]);

  useMessageTimeout(gameState.message, handleClearMessage);

  // ===== SOCKET EVENT HANDLERS =====

  const handleJoined = useCallback(
    (data: JoinedData) => {
      console.log("✅ Unido exitosamente:", data);
      gameState.setGameInitialized(true);

      const socket = socketManager.getSocket();
      const playerData: Player = {
        id: data.player?.id || socket?.id || "",
        name: data.player?.name || player.name,
        balance: data.player?.balance || 0,
        bet: data.player?.bet || 0,
        cashedOut: data.player?.cashedOut || false,
        win: data.player?.win || 0,
      };

      console.log("👤 Current player inicial:", playerData);
      gameState.setCurrentPlayer(playerData);

      if (data.gameState?.round) {
        const round = data.gameState.round;
        gameState.setRoundState(round.state || "waiting");
        gameState.setRoundNumber(round.roundNumber || 0);

        if (round.state === "running" && round.startTime) {
          multiplierState.startMultiplierAnimation(round.startTime);
        } else {
          multiplierState.setMultiplier(1.0);
        }
      }

      if (data.gameState?.players) {
        gameState.setPlayers(data.gameState.players);
      }

      gameState.setMessage("¡Conectado al juego!");
    },
    [gameState, multiplierState, player.name]
  );

  const handleJoinError = useCallback(
    (error: string) => {
      console.error("❌ Error al unirse:", error);
      gameState.setMessage(`Error: ${error}`);
    },
    [gameState]
  );

  const handleRoundNew = useCallback(
    (data: RoundNewData) => {
      console.log("🆕 Nueva ronda:", data);
      multiplierState.stopMultiplierAnimation();
      multiplierState.setMultiplier(1.0);

      gameState.setRoundNumber(data.roundNumber);
      gameState.setRoundState("waiting");

      // IMPORTANTE: Resetear apuesta del jugador actual
      if (gameState.currentPlayer) {
        console.log("🔄 Limpiando apuesta del jugador para nueva ronda");
        gameState.setCurrentPlayer({
          ...gameState.currentPlayer,
          bet: 0,
          cashedOut: false,
          win: 0,
        });
      }

      gameState.setMessage(
        `Ronda #${data.roundNumber} - ¡Haz tu apuesta! (${(
          data.waitTimeMs / 1000
        ).toFixed(0)}s)`
      );
    },
    [gameState, multiplierState]
  );

  const handleRoundStart = useCallback(
    (data: RoundStartData) => {
      console.log("🚀 Ronda iniciada:", data);

      gameState.setRoundNumber(data.roundNumber);
      gameState.setRoundState("running");
      multiplierState.startMultiplierAnimation(data.startTime);
      gameState.setMessage("¡Ronda en progreso! 🚀");
    },
    [gameState, multiplierState]
  );

  const handleRoundCrash = useCallback(
    (data: RoundCrashData) => {
      console.log("💥 Crash:", data);
      multiplierState.stopMultiplierAnimation();

      gameState.setRoundState("crashed");
      multiplierState.setMultiplier(data.crashPoint);
      gameState.setMessage(`💥 ¡Crash en ${data.crashPoint.toFixed(2)}x!`);
    },
    [gameState, multiplierState]
  );

  const handlePlayersUpdate = useCallback(
    (playerList: Player[]) => {
      console.log("📋 Actualización de jugadores:", playerList.length);

      const safePlayers = playerList.map((p) => ({
        id: p.id || "",
        name: p.name || "Anónimo",
        balance: p.balance || 0,
        bet: p.bet || 0,
        cashedOut: p.cashedOut || false,
        win: p.win || 0,
      }));

      gameState.setPlayers(safePlayers);

      // CRÍTICO: Actualizar el jugador actual desde la lista
      const socket = socketManager.getSocket();
      if (socket?.id) {
        const me = safePlayers.find((p) => p.id === socket.id);
        if (me) {
          console.log(
            "🔄 Actualizando currentPlayer desde players:update:",
            me
          );
          gameState.setCurrentPlayer(me);
        }
      }
    },
    [gameState]
  );

  const handlePlayerBet = useCallback(
    (data: PlayerBetData) => {
      console.log("🎯 Apuesta realizada:", data);

      const socket = socketManager.getSocket();
      if (data.socketId === socket?.id) {
        gameState.setMessage(`Apuesta de $${data.amount} realizada!`);

        // Actualizar inmediatamente el jugador actual
        if (gameState.currentPlayer) {
          console.log("💰 Actualizando balance después de apuesta");
          gameState.setCurrentPlayer({
            ...gameState.currentPlayer,
            balance: data.balance,
            bet: data.amount,
            cashedOut: false,
            win: 0,
          });
        }
      }
    },
    [gameState]
  );

  const handleBetResult = useCallback(
    (data: BetResultData) => {
      console.log("📊 Resultado de apuesta:", data);

      if (!data.success) {
        gameState.setMessage(data.error || "No se pudo realizar la apuesta");

        // Si la apuesta falló, asegurar que bet siga en 0
        if (gameState.currentPlayer && gameState.currentPlayer.bet > 0) {
          gameState.setCurrentPlayer({
            ...gameState.currentPlayer,
            bet: 0,
          });
        }
      } else if (data.balance !== undefined) {
        // Actualizar balance si viene en la respuesta
        if (gameState.currentPlayer) {
          gameState.setCurrentPlayer({
            ...gameState.currentPlayer,
            balance: data.balance,
          });
        }
      }
    },
    [gameState]
  );

  const handlePlayerCashout = useCallback(
    (data: PlayerCashoutData) => {
      console.log("💰 Cashout de jugador:", data);

      const socket = socketManager.getSocket();
      if (data.socketId === socket?.id) {
        gameState.setMessage(
          `¡Retiro exitoso! Ganaste $${data.winAmount.toFixed(
            2
          )} (${data.multiplier.toFixed(2)}x)`
        );

        // Actualizar el jugador actual
        if (gameState.currentPlayer) {
          console.log("💵 Actualizando después de cashout");
          gameState.setCurrentPlayer({
            ...gameState.currentPlayer,
            cashedOut: true,
            win: data.winAmount,
          });
        }
      }
    },
    [gameState]
  );

  const handleCashoutSuccess = useCallback((data: CashoutSuccessData) => {
    console.log("✅ Cashout exitoso:", data);
    // Este evento es redundante con player:cashout, pero lo dejamos por si acaso
  }, []);

  const handleCashoutFailed = useCallback(
    (reason: string) => {
      console.log("❌ Cashout fallido:", reason);
      gameState.setMessage(`Error: ${reason}`);
    },
    [gameState]
  );

  // Setup socket listeners
  useGameSocket({
    playerName: player.name,
    onJoined: handleJoined,
    onJoinError: handleJoinError,
    onRoundNew: handleRoundNew,
    onRoundStart: handleRoundStart,
    onRoundCrash: handleRoundCrash,
    onPlayersUpdate: handlePlayersUpdate,
    onPlayerBet: handlePlayerBet,
    onBetResult: handleBetResult,
    onPlayerCashout: handlePlayerCashout,
    onCashoutSuccess: handleCashoutSuccess,
    onCashoutFailed: handleCashoutFailed,
  });

  // Debug: Log cuando cambia currentPlayer
  useEffect(() => {
    if (gameState.currentPlayer) {
      console.log("🔍 Estado actual del jugador:", {
        bet: gameState.currentPlayer.bet,
        balance: gameState.currentPlayer.balance,
        cashedOut: gameState.currentPlayer.cashedOut,
        win: gameState.currentPlayer.win,
      });
    }
  }, [gameState.currentPlayer]);

  // ===== ACTION HANDLERS =====

  const handleBet = useCallback(
    (amount: number) => {
      console.log("🎲 Intentando apostar:", amount);
      console.log("📊 Estado actual:", {
        roundState: gameState.roundState,
        currentBet: gameState.currentPlayer?.bet,
        balance: gameState.currentPlayer?.balance,
      });

      if (gameState.roundState !== "waiting") {
        gameState.setMessage(
          "Solo puedes apostar durante el periodo de espera"
        );
        return;
      }

      if (!gameState.currentPlayer) {
        gameState.setMessage("Error: Jugador no inicializado");
        return;
      }

      if (gameState.currentPlayer.bet > 0) {
        gameState.setMessage("Ya tienes una apuesta activa");
        return;
      }

      if (amount > gameState.currentPlayer.balance) {
        gameState.setMessage("Saldo insuficiente");
        return;
      }

      console.log("✅ Apuesta válida, enviando al servidor");
      socketManager.emit("bet", amount);
    },
    [gameState]
  );

  const handleCashout = useCallback(() => {
    console.log("💸 Intentando retirarse");
    console.log("📊 Estado actual:", {
      roundState: gameState.roundState,
      currentBet: gameState.currentPlayer?.bet,
      cashedOut: gameState.currentPlayer?.cashedOut,
      multiplier: multiplierState.multiplier,
    });

    if (gameState.roundState !== "running") {
      gameState.setMessage("Solo puedes retirarte durante la ronda");
      return;
    }

    if (!gameState.currentPlayer || gameState.currentPlayer.bet <= 0) {
      gameState.setMessage("No tienes apuesta activa");
      return;
    }

    if (gameState.currentPlayer.cashedOut) {
      gameState.setMessage("Ya te retiraste en esta ronda");
      return;
    }

    console.log("✅ Cashout válido, enviando al servidor");
    socketManager.emit("cashout");
  }, [gameState, multiplierState.multiplier]);

  // ===== RENDER =====

  if (!gameState.gameInitialized) {
    return (
      <div className="game">
        <div className="game-info">
          <h1>Aviator Game</h1>
          <p>Inicializando juego para {player.name}...</p>
          {gameState.message && <p className="message">{gameState.message}</p>}
        </div>
      </div>
    );
  }

  if (!gameState.currentPlayer) {
    return (
      <div className="game">
        <div className="game-info">
          <h1>Aviator Game</h1>
          <p>Error cargando datos del jugador</p>
          {gameState.message && (
            <p className="message error">{gameState.message}</p>
          )}
        </div>
      </div>
    );
  }

  const canBet =
    gameState.roundState === "waiting" && gameState.currentPlayer.bet === 0;

  const canCashout =
    gameState.roundState === "running" &&
    gameState.currentPlayer.bet > 0 &&
    !gameState.currentPlayer.cashedOut;

  console.log("🎮 Estado de controles:", { canBet, canCashout });

  return (
    <div className="game">
      <div className="game-info">
        <h1>Aviator Game</h1>
        <PlayerInfo
          player={gameState.currentPlayer}
          roundNumber={gameState.roundNumber}
        />
      </div>

      <div className="middle-content">
        <PlayerList players={gameState.players} />
        <div className="multiplier-controls">
          <MultiplierDisplay
            multiplier={multiplierState.multiplier}
            roundState={gameState.roundState}
            message={gameState.message}
          />
          <Controls
            onBet={handleBet}
            onCashout={handleCashout}
            canBet={canBet}
            canCashout={canCashout}
            currentBalance={gameState.currentPlayer.balance}
          />
        </div>
      </div>
    </div>
  );
};
