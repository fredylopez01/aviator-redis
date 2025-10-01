// backend/src/game/GameManager.js
const RedisService = require("../services/RedisService");
const DatabaseService = require("../services/DatabaseService");
const LeaderElection = require("./LeaderElection");
const RoundManager = require("./RoundManager");
const PlayerManager = require("./PlayerManager");
const MultiplierCalculator = require("../utils/MultiplierCalculator");
const logger = require("../utils/logger");

class GameManager {
  constructor(io) {
    this.io = io;
    this.instanceName = process.env.INSTANCE_NAME || "backend";

    // Inicializar servicios
    this.redis = new RedisService();
    this.db = new DatabaseService();

    // Inicializar managers
    this.leaderElection = new LeaderElection(this.redis, this.instanceName);
    this.playerManager = new PlayerManager(
      this.redis,
      this.db,
      this.instanceName
    );
    this.roundManager = new RoundManager(
      this.redis,
      this.db,
      this.instanceName
    );

    this.setupRedisEvents();
  }

  /**
   * Configura los eventos de Redis Pub/Sub
   */
  async setupRedisEvents() {
    try {
      // Evento: Nueva ronda
      await this.redis.subscribe("game:round:new", (data) => {
        logger.info(
          `[${this.instanceName}] 🆕 Nueva ronda #${data.roundNumber}`
        );
        this.io.emit("round:new", {
          roundNumber: data.roundNumber,
          waitTimeMs: data.waitTimeMs,
        });
      });

      // Evento: Inicio de ronda
      await this.redis.subscribe("game:round:start", (data) => {
        logger.info(
          `[${this.instanceName}] 🚀 Ronda #${data.roundNumber} iniciada`
        );
        this.io.emit("round:start", {
          roundNumber: data.roundNumber,
          startTime: data.startTime,
        });
      });

      // Evento: Crash de ronda
      await this.redis.subscribe("game:round:crash", (data) => {
        logger.info(`[${this.instanceName}] 💥 Crash en ${data.crashPoint}x`);
        this.io.emit("round:crash", {
          roundNumber: data.roundNumber,
          crashPoint: data.crashPoint,
          crashTime: data.crashTime,
        });
      });

      // Evento: Apuesta realizada
      await this.redis.subscribe("game:player:bet", (data) => {
        this.io.emit("player:bet", {
          socketId: data.socketId,
          playerName: data.playerName,
          amount: data.amount,
          balance: data.balance,
        });
      });

      // Evento: Cashout realizado
      await this.redis.subscribe("game:player:cashout", (data) => {
        // Notificar al jugador específico
        this.io.to(data.socketId).emit("cashout:success", {
          winAmount: data.winAmount,
          multiplier: data.multiplier,
        });

        // Notificar a todos
        this.io.emit("player:cashout", {
          socketId: data.socketId,
          playerName: data.playerName,
          winAmount: data.winAmount,
          multiplier: data.multiplier,
        });
      });

      // Evento: Actualización de jugadores
      await this.redis.subscribe("game:players:update", (players) => {
        this.io.emit("players:update", players);
      });

      // Intentar convertirse en líder
      const isLeader = await this.leaderElection.tryBecomeLeader();

      if (isLeader) {
        this.roundManager.startRoundChecker(this.playerManager);
      }

      logger.info(`[${this.instanceName}] ✅ GameManager inicializado`);
    } catch (error) {
      logger.error(
        `[${this.instanceName}] ❌ Error en setupRedisEvents:`,
        error
      );
    }
  }

  // ===== MÉTODOS PÚBLICOS =====

  /**
   * Agrega un jugador al juego
   */
  async addPlayer(socketId, name) {
    const user = await this.playerManager.addPlayer(socketId, name);
    await this.publishPlayersUpdate();
    return user;
  }

  /**
   * Elimina un jugador del juego
   */
  async removePlayer(socketId) {
    await this.playerManager.removePlayer(socketId);
    await this.publishPlayersUpdate();
  }

  /**
   * Procesa una apuesta
   */
  async placeBet(socketId, amount) {
    // Verificar que la ronda esté en estado "waiting"
    const round = await this.roundManager.getCurrentRound();
    if (!round || round.state !== "waiting") {
      return { success: false, error: "No puedes apostar ahora" };
    }

    // Realizar la apuesta
    const result = await this.playerManager.placeBet(
      socketId,
      amount,
      round.roundNumber
    );

    if (result.success) {
      // Publicar evento de apuesta
      await this.redis.publish("game:player:bet", {
        socketId,
        playerName: result.playerName,
        amount,
        balance: result.balance,
      });

      // Agregar apuesta a la ronda en MongoDB (solo el líder)
      if (this.leaderElection.checkIsLeader()) {
        await this.roundManager.addBetToRound(round.roundNumber, {
          userId: result.userId,
          playerName: result.playerName,
          socketId,
          amount,
          cashedOut: false,
        });
      }

      // Publicar actualización de jugadores
      await this.publishPlayersUpdate();
    }

    return result;
  }

  /**
   * Procesa un cashout
   */
  async cashout(socketId) {
    // Verificar que la ronda esté corriendo
    const round = await this.roundManager.getCurrentRound();
    if (!round || round.state !== "running") {
      return { success: false, error: "No hay ronda en progreso" };
    }

    // Calcular multiplicador actual
    const multiplier = MultiplierCalculator.calculateMultiplier(
      round.startTime
    );

    // Verificar que no haya pasado el crash point
    if (multiplier >= round.crashPoint) {
      return { success: false, error: "Demasiado tarde, ya crasheó" };
    }

    // Realizar el cashout
    const result = await this.playerManager.cashout(socketId, multiplier);

    if (result.success) {
      // Publicar evento de cashout
      await this.redis.publish("game:player:cashout", {
        socketId,
        playerName: result.playerName,
        winAmount: result.winAmount,
        multiplier: result.multiplier,
        balance: result.balance,
      });

      // Actualizar cashout en la ronda de MongoDB (solo el líder)
      if (this.leaderElection.checkIsLeader()) {
        await this.roundManager.updateCashoutInRound(
          round.roundNumber,
          socketId,
          {
            cashedOut: true,
            cashoutMultiplier: multiplier,
            winAmount: result.winAmount,
          }
        );
      }

      // Publicar actualización de jugadores
      await this.publishPlayersUpdate();
    }

    return result;
  }

  /**
   * Obtiene el estado actual del juego
   */
  async getGameState() {
    const players = await this.playerManager.getAllPlayers();
    const round = await this.roundManager.getCurrentRound();

    let roundInfo = { state: "waiting", multiplier: 1.0 };

    if (round) {
      roundInfo = {
        roundNumber: round.roundNumber,
        state: round.state,
        startTime: round.startTime,
      };

      if (round.state === "running") {
        roundInfo.multiplier = MultiplierCalculator.calculateMultiplier(
          round.startTime
        );
      }
    }

    return { round: roundInfo, players };
  }

  /**
   * Obtiene el número de jugadores conectados
   */
  async getPlayerCount() {
    return await this.playerManager.getPlayerCount();
  }

  /**
   * Publica actualización de la lista de jugadores
   */
  async publishPlayersUpdate() {
    const players = await this.playerManager.getAllPlayers();
    await this.redis.publish("game:players:update", players);
  }

  /**
   * Detiene el GameManager
   */
  stopGame() {
    logger.info(`[${this.instanceName}] 🛑 Deteniendo GameManager`);

    this.leaderElection.stop();
    this.roundManager.stopRoundChecker();
  }
}

module.exports = GameManager;
