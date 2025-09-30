import { useEffect, useState, useRef } from "react";
import { socketManager } from "../socket";
import Controls from "./Controls";
import PlayerList from "./PlayerList";

interface Player {
  id: string;
  name: string;
  balance: number;
  bet: number;
  cashedOut: boolean;
  win: number;
}

interface GameProps {
  player: { name: string };
}

const TICK_INTERVAL = 100; // 100ms
const TICK_INCREMENT = 0.01; // 0.01 por tick

function Game({ player }: GameProps) {
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [roundState, setRoundState] = useState<string>("waiting");
  const [roundNumber, setRoundNumber] = useState<number>(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [message, setMessage] = useState<string>("");
  const [gameInitialized, setGameInitialized] = useState<boolean>(false);

  // Referencias
  const roundStartTime = useRef<number | null>(null);
  const multiplierInterval = useRef<number | null>(null);

  // Limpiar intervalo
  const clearMultiplierInterval = () => {
    if (multiplierInterval.current) {
      clearInterval(multiplierInterval.current);
      multiplierInterval.current = null;
    }
  };

  // Calcular multiplicador basado en timestamp del servidor
  const calculateMultiplier = (startTime: number): number => {
    const elapsed = Date.now() - startTime;
    if (elapsed < 0) return 1.0;

    const ticks = Math.floor(elapsed / TICK_INTERVAL);
    const calculatedMultiplier = 1.0 + ticks * TICK_INCREMENT;

    return parseFloat(calculatedMultiplier.toFixed(2));
  };

  // Iniciar animación del multiplicador
  const startMultiplierAnimation = (startTime: number) => {
    clearMultiplierInterval();
    roundStartTime.current = startTime;

    // Calcular cuánto tiempo falta para que inicie
    const delay = startTime - Date.now();

    if (delay > 0) {
      // Esperar hasta el inicio exacto
      setTimeout(() => {
        startMultiplierLoop();
      }, delay);
    } else {
      // Ya inició, empezar inmediatamente
      startMultiplierLoop();
    }
  };

  const startMultiplierLoop = () => {
    if (!roundStartTime.current) return;

    // Actualizar cada 50ms para animación suave
    multiplierInterval.current = setInterval(() => {
      if (!roundStartTime.current) {
        clearMultiplierInterval();
        return;
      }

      const newMultiplier = calculateMultiplier(roundStartTime.current);
      setMultiplier(newMultiplier);
    }, 50);
  };

  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    socketManager.setPlayerName(player.name);
    console.log("🔌 Enviando join para:", player.name);
    socket.emit("join", player.name);

    // ===== JOINED: Confirmación de unión =====
    socket.on("joined", (data) => {
      console.log("✅ Unido exitosamente:", data);
      setGameInitialized(true);

      const playerData: Player = {
        id: data.player?.id || socket.id!,
        name: data.player?.name || player.name,
        balance: data.player?.balance || 0,
        bet: data.player?.bet || 0,
        cashedOut: data.player?.cashedOut || false,
        win: data.player?.win || 0,
      };

      setCurrentPlayer(playerData);

      // Sincronizar con el estado actual del juego
      if (data.gameState?.round) {
        const round = data.gameState.round;
        setRoundState(round.state || "waiting");
        setRoundNumber(round.roundNumber || 0);

        // Si la ronda está corriendo, sincronizar multiplicador
        if (round.state === "running" && round.startTime) {
          startMultiplierAnimation(round.startTime);
        } else {
          setMultiplier(1.0);
        }
      }

      if (data.gameState?.players) {
        setPlayers(data.gameState.players);
      }

      setMessage("¡Conectado al juego!");
    });

    socket.on("join:error", (error: string) => {
      console.error("❌ Error al unirse:", error);
      setMessage(`Error: ${error}`);
    });

    // ===== ROUND:NEW: Nueva ronda (periodo de apuestas) =====
    socket.on(
      "round:new",
      (data: { roundNumber: number; waitTimeMs: number }) => {
        console.log("🆕 Nueva ronda:", data);
        clearMultiplierInterval();
        roundStartTime.current = null;

        setRoundNumber(data.roundNumber);
        setRoundState("waiting");
        setMultiplier(1.0);
        setMessage(
          `Ronda #${data.roundNumber} - ¡Haz tu apuesta! (${(
            data.waitTimeMs / 1000
          ).toFixed(0)}s)`
        );
      }
    );

    // ===== ROUND:START: Inicio de ronda (despegue) =====
    socket.on(
      "round:start",
      (data: { roundNumber: number; startTime: number }) => {
        console.log("🚀 Ronda iniciada:", data);

        setRoundNumber(data.roundNumber);
        setRoundState("running");

        // Iniciar animación sincronizada con el servidor
        startMultiplierAnimation(data.startTime);

        setMessage("¡Ronda en progreso! 🚀");
      }
    );

    // ===== ROUND:CRASH: Crash de ronda =====
    socket.on(
      "round:crash",
      (data: {
        roundNumber: number;
        crashPoint: number;
        crashTime: number;
      }) => {
        console.log("💥 Crash:", data);
        clearMultiplierInterval();

        setRoundState("crashed");
        setMultiplier(data.crashPoint);
        setMessage(`💥 ¡Crash en ${data.crashPoint.toFixed(2)}x!`);
      }
    );

    // ===== PLAYERS:UPDATE: Actualización de jugadores =====
    socket.on("players:update", (playerList: Player[]) => {
      const safePlayers = playerList.map((p) => ({
        id: p.id || "",
        name: p.name || "Anónimo",
        balance: p.balance || 0,
        bet: p.bet || 0,
        cashedOut: p.cashedOut || false,
        win: p.win || 0,
      }));

      setPlayers(safePlayers);

      // Actualizar jugador actual
      const me = safePlayers.find((p) => p.id === socket.id);
      if (me) {
        setCurrentPlayer(me);
      }
    });

    // ===== PLAYER:BET: Apuesta de cualquier jugador =====
    socket.on(
      "player:bet",
      (data: {
        socketId: string;
        playerName: string;
        amount: number;
        balance: number;
      }) => {
        console.log("🎯 Apuesta realizada:", data);

        if (data.socketId === socket.id) {
          setMessage(`Apuesta de ${data.amount} realizada!`);
        }
      }
    );

    // ===== BET:RESULT: Resultado de mi apuesta =====
    socket.on(
      "bet:result",
      (data: { success: boolean; balance?: number; error?: string }) => {
        console.log("📊 Resultado de apuesta:", data);

        if (!data.success) {
          setMessage(data.error || "No se pudo realizar la apuesta");
        }
      }
    );

    // ===== PLAYER:CASHOUT: Cashout de cualquier jugador =====
    socket.on(
      "player:cashout",
      (data: {
        socketId: string;
        playerName: string;
        winAmount: number;
        multiplier: number;
      }) => {
        console.log("💰 Cashout:", data);

        if (data.socketId === socket.id) {
          setMessage(
            `¡Retiro exitoso! Ganaste ${data.winAmount.toFixed(
              2
            )} (${data.multiplier.toFixed(2)}x)`
          );
        }
      }
    );

    // ===== CASHOUT:SUCCESS: Mi cashout exitoso =====
    socket.on(
      "cashout:success",
      (data: { winAmount: number; multiplier: number }) => {
        console.log("✅ Cashout exitoso:", data);
        setMessage(
          `¡Retiro exitoso! Ganaste ${data.winAmount.toFixed(
            2
          )} (${data.multiplier.toFixed(2)}x)`
        );
      }
    );

    // ===== CASHOUT:FAILED: Mi cashout falló =====
    socket.on("cashout:failed", (reason: string) => {
      console.log("❌ Cashout fallido:", reason);
      setMessage(`Error: ${reason}`);
    });

    // Cleanup
    return () => {
      clearMultiplierInterval();
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
  }, [player.name]);

  // Limpiar mensaje después de 3 segundos
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Limpiar intervalo al desmontar
  useEffect(() => {
    return () => {
      clearMultiplierInterval();
    };
  }, []);

  // ===== HANDLERS =====

  const handleBet = (amount: number) => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    if (roundState !== "waiting") {
      setMessage("Solo puedes apostar durante el periodo de espera");
      return;
    }

    if (!currentPlayer) {
      setMessage("Error: Jugador no inicializado");
      return;
    }

    if (currentPlayer.bet > 0) {
      setMessage("Ya tienes una apuesta activa");
      return;
    }

    if (amount > currentPlayer.balance) {
      setMessage("Saldo insuficiente");
      return;
    }

    console.log("📤 Enviando apuesta:", amount);
    socket.emit("bet", amount);
  };

  const handleCashout = () => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    if (roundState !== "running") {
      setMessage("Solo puedes retirarte durante la ronda");
      return;
    }

    if (!currentPlayer || currentPlayer.bet <= 0) {
      setMessage("No tienes apuesta activa");
      return;
    }

    if (currentPlayer.cashedOut) {
      setMessage("Ya te retiraste en esta ronda");
      return;
    }

    console.log("📤 Enviando cashout en", multiplier.toFixed(2) + "x");
    socket.emit("cashout");
  };

  // ===== UTILIDADES =====

  const getMultiplierColor = () => {
    if (roundState === "crashed") return "#ff4444";
    if (roundState === "running") return "#00ff00";
    return "#ffffff";
  };

  // ===== RENDER =====

  if (!gameInitialized) {
    return (
      <div className="game">
        <div className="game-info">
          <h1>Aviator Game</h1>
          <p>Inicializando juego para {player.name}...</p>
          {message && <p className="message">{message}</p>}
        </div>
      </div>
    );
  }

  if (!currentPlayer) {
    return (
      <div className="game">
        <div className="game-info">
          <h1>Aviator Game</h1>
          <p>Error cargando datos del jugador</p>
          {message && <p className="message error">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="game">
      <div className="game-info">
        <h1>Aviator Game</h1>
        <div className="player-info">
          <p className="balance-value">
            ${currentPlayer.balance.toFixed(2)} USD
          </p>
          <p>Bienvenido, {currentPlayer.name}!</p>
          <p className="round-info">Ronda #{roundNumber}</p>
          {currentPlayer.bet > 0 && (
            <p>Apuesta actual: ${currentPlayer.bet.toFixed(2)}</p>
          )}
          {currentPlayer.win > 0 && (
            <p className="win-amount">
              Ganancia: ${currentPlayer.win.toFixed(2)}
            </p>
          )}
        </div>
      </div>

      <div className="middle-content">
        <PlayerList players={players} />
        <div className="multiplier-controls">
          <div
            className="multiplier-display"
            style={{ color: getMultiplierColor() }}
          >
            <h2>{multiplier.toFixed(2)}x</h2>
            <p className="round-state">
              {roundState === "waiting" && "⏳ Esperando..."}
              {roundState === "running" && "🚀 ¡Volando!"}
              {roundState === "crashed" && "💥 Crashed"}
            </p>
            {message && <p className="message">{message}</p>}
          </div>
          <Controls
            onBet={handleBet}
            onCashout={handleCashout}
            canBet={roundState === "waiting" && currentPlayer.bet === 0}
            canCashout={
              roundState === "running" &&
              currentPlayer.bet > 0 &&
              !currentPlayer.cashedOut
            }
            currentBalance={currentPlayer.balance}
          />
        </div>
      </div>
    </div>
  );
}

export default Game;
