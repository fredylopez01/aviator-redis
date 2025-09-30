const GameManager = require("../game/gameManager");
const logger = require("../utils/logger");

let gameManager;

module.exports = (io, socket) => {
  const instanceName = process.env.INSTANCE_NAME || "backend";
  logger.info(`[${instanceName}] Cliente conectado: ${socket.id}`);

  // Cuando un jugador se une
  socket.on("join", async (name) => {
    try {
      logger.info(
        `[${instanceName}] Jugador ${name} se unió con ID: ${socket.id}`
      );

      // Inicializar gameManager solo cuando el primer jugador se une
      if (!gameManager) {
        gameManager = new GameManager(io);
        logger.info(
          `[${instanceName}] GameManager inicializado - Intentando ser líder`
        );

        // Esperar un poco para que Redis se configure
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Solo el líder iniciará la primera ronda
        if (gameManager.isLeader) {
          logger.info(`[${instanceName}] Soy líder - Iniciando primera ronda`);
          await gameManager.startRound();
        }
      }

      // Agregar jugador al gameManager (SOLO UNA VEZ)
      const user = await gameManager.addPlayer(socket.id, name);

      // Enviar información inicial al jugador
      const gameState = await gameManager.getGameState();
      socket.emit("joined", {
        player: gameManager.players[socket.id],
        gameState: gameState,
      });
    } catch (error) {
      logger.error(`[${instanceName}] Error en join:`, error);
      socket.emit("join:error", "Error al unirse al juego");
    }
  });

  // Cuando un jugador hace una apuesta
  socket.on("bet", async (amount) => {
    if (!gameManager) {
      socket.emit("bet:result", {
        success: false,
        error: "Juego no inicializado",
      });
      return;
    }

    logger.info(
      `[${instanceName}] Jugador ${socket.id} intenta apostar: ${amount}`
    );
    const success = await gameManager.placeBet(socket.id, amount);

    socket.emit("bet:result", {
      success,
      player: gameManager.players[socket.id] || null,
      error: success ? null : "No se pudo realizar la apuesta",
    });
  });

  // Cuando un jugador se retira
  socket.on("cashout", async () => {
    if (!gameManager) {
      socket.emit("cashout:failed", "Juego no inicializado");
      return;
    }

    logger.info(`[${instanceName}] Jugador ${socket.id} intenta retirarse`);
    const result = await gameManager.cashout(socket.id);

    if (!result.success) {
      socket.emit("cashout:failed", result.error || "No se pudo retirar");
    }
  });

  // Cuando un jugador se desconecta
  socket.on("disconnect", async () => {
    logger.info(`[${instanceName}] Cliente desconectado: ${socket.id}`);

    if (gameManager) {
      await gameManager.removePlayer(socket.id);

      // Verificar jugadores en Redis (no solo locales)
      const totalPlayers = await gameManager.getTotalPlayersCount();

      if (totalPlayers === 0) {
        logger.info(
          `[${instanceName}] No quedan jugadores en el sistema - Deteniendo GameManager`
        );
        gameManager.stopGame();
        gameManager = null;
      } else {
        logger.info(
          `[${instanceName}] Todavía hay ${totalPlayers} jugador(es) en el sistema`
        );
      }
    }
  });
};
