// backend/src/sockets/gameSocket.js
const GameManager = require("../game/gameManager");
const logger = require("../utils/logger");

// UNA SOLA INSTANCIA DE GAMEMANAGER POR BACKEND
let gameManager = null;

module.exports = (io, socket) => {
  const instanceName = process.env.INSTANCE_NAME || "backend";

  logger.info(`[${instanceName}] 🔌 Cliente conectado: ${socket.id}`);

  // Inicializar GameManager solo una vez por backend
  if (!gameManager) {
    gameManager = new GameManager(io);
    logger.info(`[${instanceName}] 🎮 GameManager inicializado`);
  }

  // ===== JOIN =====
  socket.on("join", async (name) => {
    try {
      logger.info(`[${instanceName}] 👤 ${name} se unió (${socket.id})`);

      const user = await gameManager.addPlayer(socket.id, name);
      const gameState = await gameManager.getGameState();

      socket.emit("joined", {
        player: {
          id: socket.id,
          name: user.name,
          balance: user.balance,
          bet: 0,
          cashedOut: false,
          win: 0,
        },
        gameState,
      });

      logger.info(`[${instanceName}] ✅ ${name} unido exitosamente`);
    } catch (error) {
      logger.error(`[${instanceName}] ❌ Error en join:`, error);
      socket.emit("join:error", "Error al unirse al juego");
    }
  });

  // ===== BET =====
  socket.on("bet", async (amount) => {
    try {
      logger.info(`[${instanceName}] 🎯 Apuesta de ${socket.id}: $${amount}`);

      const result = await gameManager.placeBet(socket.id, amount);
      socket.emit("bet:result", result);
    } catch (error) {
      logger.error(`[${instanceName}] ❌ Error en bet:`, error);
      socket.emit("bet:result", {
        success: false,
        error: "Error al realizar apuesta",
      });
    }
  });

  // ===== CASHOUT =====
  socket.on("cashout", async () => {
    try {
      logger.info(`[${instanceName}] 💰 Cashout de ${socket.id}`);

      const result = await gameManager.cashout(socket.id);

      if (!result.success) {
        socket.emit("cashout:failed", result.error);
      }
    } catch (error) {
      logger.error(`[${instanceName}] ❌ Error en cashout:`, error);
      socket.emit("cashout:failed", "Error al retirar");
    }
  });

  // ===== DISCONNECT =====
  socket.on("disconnect", async () => {
    try {
      logger.info(`[${instanceName}] 🔌 Cliente desconectado: ${socket.id}`);

      await gameManager.removePlayer(socket.id);

      const playerCount = await gameManager.getPlayerCount();
      logger.info(`[${instanceName}] 👥 Jugadores restantes: ${playerCount}`);
    } catch (error) {
      logger.error(`[${instanceName}] ❌ Error en disconnect:`, error);
    }
  });
};
