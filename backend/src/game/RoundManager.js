// backend/src/game/RoundManager.js
const MultiplierCalculator = require("../utils/MultiplierCalculator");
const logger = require("../utils/logger");

class RoundManager {
  constructor(redisService, databaseService, instanceName) {
    this.redis = redisService;
    this.db = databaseService;
    this.instanceName = instanceName;
    this.checkInterval = null;
  }

  /**
   * Crea una nueva ronda
   */
  async createNewRound(playerManager) {
    try {
      const roundNumber = await this.db.getNextRoundNumber();
      const timestamps = MultiplierCalculator.calculateRoundTimestamps(5000);

      const round = {
        roundNumber,
        ...timestamps,
        state: "waiting",
      };

      // Guardar en Redis
      await this.redis.saveCurrentRound(round);

      // Crear documento en MongoDB
      await this.db.createRound({
        roundNumber,
        crashPoint: timestamps.crashPoint,
        state: "waiting",
        startTime: new Date(timestamps.startTime),
        crashTime: new Date(timestamps.crashTime),
      });

      // Resetear apuestas de todos los jugadores
      await playerManager.resetAllBets();

      // Publicar evento
      await this.redis.publish("game:round:new", {
        roundNumber,
        waitTimeMs: 5000,
      });

      // Publicar actualización de jugadores
      const players = await playerManager.getAllPlayers();
      await this.redis.publish("game:players:update", players);

      logger.info(
        `[${this.instanceName}] 🎲 Ronda #${roundNumber} creada - Crash: ${
          timestamps.crashPoint
        }x en ${(timestamps.durationMs / 1000).toFixed(1)}s`
      );

      return round;
    } catch (error) {
      logger.error(`[${this.instanceName}] Error creando ronda:`, error);
      throw error;
    }
  }

  /**
   * Inicia una ronda
   */
  async startRound(round) {
    try {
      round.state = "running";
      await this.redis.saveCurrentRound(round);

      // Actualizar MongoDB
      await this.db.updateRoundState(round.roundNumber, "running", {
        actualStartTime: new Date(),
      });

      // Publicar evento
      await this.redis.publish("game:round:start", {
        roundNumber: round.roundNumber,
        startTime: round.startTime,
      });

      logger.info(
        `[${this.instanceName}] ▶️ Ronda #${round.roundNumber} iniciada`
      );
    } catch (error) {
      logger.error(`[${this.instanceName}] Error iniciando ronda:`, error);
    }
  }

  /**
   * Crashea una ronda
   */
  async crashRound(round) {
    try {
      round.state = "crashed";
      await this.redis.saveCurrentRound(round);

      // Finalizar ronda en MongoDB
      await this.db.finalizeRound(round.roundNumber);

      // Publicar evento
      await this.redis.publish("game:round:crash", {
        roundNumber: round.roundNumber,
        crashPoint: round.crashPoint,
        crashTime: round.crashTime,
      });

      logger.info(
        `[${this.instanceName}] 💥 Ronda #${round.roundNumber} crashed en ${round.crashPoint}x`
      );

      // Esperar 3 segundos antes de limpiar
      setTimeout(async () => {
        await this.redis.deleteCurrentRound();
      }, 3000);
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en crash:`, error);
    }
  }

  /**
   * Agrega una apuesta a la ronda en MongoDB
   */
  async addBetToRound(roundNumber, betData) {
    try {
      await this.db.addBetToRound(roundNumber, betData);
    } catch (error) {
      logger.error(`[${this.instanceName}] Error agregando apuesta:`, error);
    }
  }

  /**
   * Actualiza un cashout en la ronda de MongoDB
   */
  async updateCashoutInRound(roundNumber, socketId, cashoutData) {
    try {
      await this.db.updateBetInRound(roundNumber, socketId, cashoutData);
    } catch (error) {
      logger.error(`[${this.instanceName}] Error actualizando cashout:`, error);
    }
  }

  /**
   * Inicia el verificador de estado de rondas (solo para el líder)
   */
  startRoundChecker(playerManager, onNewRoundCreated) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.checkRoundStatus(playerManager, onNewRoundCreated);
    }, 500);

    // Primera verificación inmediata
    this.checkRoundStatus(playerManager, onNewRoundCreated);
  }

  /**
   * Verifica el estado actual de la ronda y actúa en consecuencia
   */
  async checkRoundStatus(playerManager, onNewRoundCreated) {
    try {
      const round = await this.redis.getCurrentRound();
      const now = Date.now();

      if (!round) {
        // No hay ronda, crear una si hay jugadores
        const playerCount = await playerManager.getPlayerCount();
        if (playerCount > 0) {
          const newRound = await this.createNewRound(playerManager);
          if (onNewRoundCreated) {
            onNewRoundCreated(newRound);
          }
        }
        return;
      }

      if (round.state === "waiting" && now >= round.startTime) {
        // Es hora de iniciar la ronda
        await this.startRound(round);
      } else if (round.state === "running" && now >= round.crashTime) {
        // Es hora de crashear
        await this.crashRound(round);
      }
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en checkRoundStatus:`, error);
    }
  }

  /**
   * Detiene el verificador de rondas
   */
  stopRoundChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Obtiene la ronda actual
   */
  async getCurrentRound() {
    return await this.redis.getCurrentRound();
  }
}

module.exports = RoundManager;
