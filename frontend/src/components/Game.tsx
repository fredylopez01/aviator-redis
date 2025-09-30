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

// Configuración del juego (debe coincidir con backend)
const TICK_INTERVAL = 50; // ms
const TICK_INCREMENT = 0.01; // incremento por tick

function Game({ player }: GameProps) {
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [roundState, setRoundState] = useState<string>("waiting");
  const [roundNumber, setRoundNumber] = useState<number>(0);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [message, setMessage] = useState<string>("");
  const [gameInitialized, setGameInitialized] = useState<boolean>(false);

  // Referencias para el cálculo del multiplicador
  const roundStartTime = useRef<number | null>(null);
  const multiplierInterval = useRef<number | null>(null);
  const crashPoint = useRef<number>(2.0);

  // Limpiar intervalo del multiplicador
  const clearMultiplierInterval = () => {
    if (multiplierInterval.current) {
      clearInterval(multiplierInterval.current);
      multiplierInterval.current = null;
    }
  };

  // Calcular multiplicador basado en tiempo
  const calculateMultiplier = (startTime: number): number => {
    const elapsed = Date.now() - startTime;
    if (elapsed < 0) return 1.0;

    const ticks = Math.floor(elapsed / TICK_INTERVAL);
    const calculatedMultiplier = 1.0 + ticks * TICK_INCREMENT;

    return parseFloat(calculatedMultiplier.toFixed(2));
  };

  // Iniciar actualización del multiplicador
  const startMultiplierUpdate = (startTime: number) => {
    clearMultiplierInterval();
    roundStartTime.current = startTime;

    // Esperar hasta que llegue el momento de inicio
    const delay = startTime - Date.now();

    if (delay > 0) {
      // Si aún no es tiempo, esperar
      setTimeout(() => {
        startMultiplierLoop();
      }, delay);
    } else {
      // Ya pasó el tiempo, iniciar inmediatamente
      startMultiplierLoop();
    }
  };

  const startMultiplierLoop = () => {
    if (!roundStartTime.current) return;

    // Actualizar multiplicador cada TICK_INTERVAL
    multiplierInterval.current = setInterval(() => {
      if (!roundStartTime.current) {
        clearMultiplierInterval();
        return;
      }

      const newMultiplier = calculateMultiplier(roundStartTime.current);
      setMultiplier(newMultiplier);

      // Verificar si llegamos al crashPoint (por seguridad, aunque el backend controla esto)
      if (newMultiplier >= crashPoint.current) {
        clearMultiplierInterval();
      }
    }, TICK_INTERVAL);
  };

  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    socketManager.setPlayerName(player.name);
    console.log("Enviando evento join para:", player.name);
    socket.emit("join", player.name);

    // ===== UNIRSE AL JUEGO =====
    socket.on("join:error", (error: string) => {
      console.error("Error al unirse:", error);
      setMessage(`Error: ${error}`);
    });

    socket.on("joined", (data) => {
      console.log("✅ Unido exitosamente:", data);
      setGameInitialized(true);

      const playerData = {
        id: data.player?.id || socket.id,
        name: data.player?.name || player.name,
        balance: data.player?.balance || 0,
        bet: data.player?.bet || 0,
        cashedOut: data.player?.cashedOut || false,
        win: data.player?.win || 0,
      };

      setCurrentPlayer(playerData);

      if (data.gameState?.round) {
        setRoundState(data.gameState.round.state || "waiting");
        setRoundNumber(data.gameState.round.roundNumber || 0);

        // Si la ronda está corriendo, sincronizar multiplicador
        if (
          data.gameState.round.state === "running" &&
          data.gameState.round.startTime
        ) {
          crashPoint.current = data.gameState.round.crashPoint || 2.0;
          startMultiplierUpdate(data.gameState.round.startTime);
        } else {
          setMultiplier(1.0);
        }
      }

      setMessage("¡Conectado al juego!");
    });

    // ===== NUEVA RONDA (Período de espera) =====
    socket.on("round:new", (data) => {
      console.log("🆕 Nueva ronda:", data);
      clearMultiplierInterval();
      roundStartTime.current = null;

      setRoundNumber(data.roundNumber);
      setRoundState("waiting");
      setMultiplier(1.0);
      setMessage(
        `Ronda #${data.roundNumber} - Apostar ahora (${data.waitTime / 1000}s)`
      );
    });

    // ===== INICIO DE RONDA (Con timestamp) =====
    socket.on("round:start", (data) => {
      console.log("🚀 Ronda iniciada:", data);

      setRoundNumber(data.roundNumber);
      setRoundState("running");
      crashPoint.current = data.crashPoint;

      // Iniciar cálculo local del multiplicador
      startMultiplierUpdate(data.startTime);

      setMessage("¡Ronda en progreso!");
    });

    // ===== CRASH DE RONDA =====
    socket.on("round:crash", (data) => {
      console.log("💥 Crash:", data);
      clearMultiplierInterval();

      setRoundState("crashed");
      setMultiplier(data.crashPoint);
      setMessage(`💥 Crash en ${data.crashPoint}x!`);
    });

    // ===== ACTUALIZACIÓN DE JUGADORES =====
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

      const me = safePlayers.find((p) => p.id === socket.id);
      if (me) {
        setCurrentPlayer(me);
      }
    });

    // ===== APUESTA DE JUGADOR =====
    socket.on("player:bet", (data) => {
      console.log("Apuesta realizada:", data);

      if (data.socketId === socket.id) {
        setMessage(`Apuesta de ${data.amount} realizada!`);
      }
    });

    // ===== RESULTADO DE APUESTA =====
    socket.on("bet:result", (data) => {
      console.log("Resultado de apuesta:", data);

      if (data.success && data.player) {
        const safePlayer = {
          id: data.player.id || socket.id,
          name: data.player.name || player.name,
          balance: data.player.balance || 0,
          bet: data.player.bet || 0,
          cashedOut: data.player.cashedOut || false,
          win: data.player.win || 0,
        };

        setCurrentPlayer(safePlayer);
      } else {
        setMessage(data.error || "No se pudo realizar la apuesta");
      }
    });

    // ===== CASHOUT DE JUGADOR =====
    socket.on("player:cashout", (data) => {
      console.log("Cashout ejecutado:", data);

      if (data.socketId === socket.id) {
        setMessage(
          `Retiro exitoso! Ganaste ${data.winAmount.toFixed(
            2
          )} con ${data.multiplier.toFixed(2)}x`
        );
      }
    });

    // ===== CASHOUT EXITOSO =====
    socket.on("cashout:success", (data) => {
      setMessage(
        `Retiro exitoso! Ganaste ${data.winAmount.toFixed(
          2
        )} con ${data.multiplier.toFixed(2)}x`
      );
    });

    // ===== CASHOUT FALLIDO =====
    socket.on("cashout:failed", (reason) => {
      setMessage(`Error al retirar: ${reason}`);
    });

    // Cleanup
    return () => {
      clearMultiplierInterval();
      socket.off("join:error");
      socket.off("joined");
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
  }, []);

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

  const handleBet = (amount: number) => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    if (
      roundState === "waiting" &&
      currentPlayer &&
      amount <= currentPlayer.balance &&
      currentPlayer.bet === 0
    ) {
      console.log("Enviando apuesta:", amount);
      socket.emit("bet", amount);
    } else {
      if (currentPlayer && currentPlayer?.bet > 0) {
        setMessage("Ya tienes una apuesta activa");
      } else if (amount > (currentPlayer?.balance || 0)) {
        setMessage("Saldo insuficiente");
      } else {
        setMessage("No puedes apostar ahora");
      }
    }
  };

  const handleCashout = () => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    if (
      roundState === "running" &&
      currentPlayer &&
      currentPlayer.bet > 0 &&
      !currentPlayer.cashedOut
    ) {
      console.log("Intentando retirarse en", multiplier.toFixed(2) + "x");
      socket.emit("cashout");
    } else {
      if (!currentPlayer?.bet || currentPlayer.bet === 0) {
        setMessage("No tienes apuesta activa");
      } else if (currentPlayer?.cashedOut) {
        setMessage("Ya te retiraste en esta ronda");
      } else {
        setMessage("No puedes retirarte ahora");
      }
    }
  };

  const getMultiplierColor = () => {
    if (roundState === "crashed") return "#ff4444";
    if (roundState === "running") return "#00ff00";
    return "#ffffff";
  };

  // Mostrar pantalla de inicialización
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

  // Mostrar error si no se puede cargar el jugador
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
            <p className="round-state">Estado: {roundState}</p>
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
