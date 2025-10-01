// backend/src/game/PlayerManager.js
const config = require("../config/gameConfig");
const logger = require("../utils/logger");

class PlayerManager {
  constructor(redisService, databaseService, instanceName) {
    this.redis = redisService;
    this.db = databaseService;
    this.instanceName = instanceName;
  }

  /**
   * Agrega un nuevo jugador al sistema
   */
  async addPlayer(socketId, name) {
    try {
      // Crear o recuperar usuario de la base de datos
      const user = await this.db.findOrCreateUser(
        socketId,
        name,
        config.initialBalance
      );

      // Guardar en Redis
      await this.redis.savePlayer(socketId, {
        name: user.name,
        balance: user.balance,
        bet: 0,
        cashedOut: false,
        win: 0,
      });

      logger.info(
        `[${this.instanceName}] ➕ Jugador añadido: ${name} (${socketId})`
      );

      return user;
    } catch (error) {
      logger.error(`[${this.instanceName}] Error añadiendo jugador:`, error);
      throw error;
    }
  }

  /**
   * Elimina un jugador del sistema
   */
  async removePlayer(socketId) {
    try {
      await this.db.deactivateUser(socketId);
      await this.redis.deletePlayer(socketId);

      logger.info(`[${this.instanceName}] ➖ Jugador eliminado: ${socketId}`);
    } catch (error) {
      logger.error(`[${this.instanceName}] Error eliminando jugador:`, error);
    }
  }

  /**
   * Realiza una apuesta para un jugador
   */
  async placeBet(socketId, amount, roundNumber) {
    try {
      // Validar monto
      if (amount < config.minBet || amount > config.maxBet) {
        return { success: false, error: "Monto inválido" };
      }

      // Obtener jugador de Redis
      const player = await this.redis.getPlayer(socketId);
      if (!player) {
        return { success: false, error: "Jugador no encontrado" };
      }

      // Validar apuesta existente
      if (player.bet > 0) {
        return { success: false, error: "Ya tienes una apuesta activa" };
      }

      // Validar balance
      if (amount > player.balance) {
        return { success: false, error: "Saldo insuficiente" };
      }

      // Actualizar balance y apuesta
      const newBalance = player.balance - amount;
      await this.redis.updatePlayer(socketId, {
        balance: newBalance,
        bet: amount,
      });

      // Actualizar base de datos
      const user = await this.db.incrementUserStats(socketId, {
        balance: newBalance,
        totalBets: amount,
      });

      logger.info(
        `[${this.instanceName}] 🎯 Apuesta: ${player.name} - $${amount}`
      );

      return {
        success: true,
        balance: newBalance,
        userId: user._id.toString(),
        playerName: player.name,
      };
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en placeBet:`, error);
      return { success: false, error: "Error interno" };
    }
  }

  /**
   * Realiza un cashout para un jugador
   */
  async cashout(socketId, multiplier) {
    try {
      // Obtener jugador de Redis
      const player = await this.redis.getPlayer(socketId);
      if (!player) {
        return { success: false, error: "Jugador no encontrado" };
      }

      // Validaciones
      if (player.bet <= 0) {
        return { success: false, error: "No tienes apuesta activa" };
      }

      if (player.cashedOut) {
        return { success: false, error: "Ya te retiraste" };
      }

      // Calcular ganancia
      const winAmount = player.bet * multiplier;
      const newBalance = player.balance + winAmount;

      // Actualizar Redis
      await this.redis.updatePlayer(socketId, {
        balance: newBalance,
        cashedOut: true,
        win: winAmount,
      });

      // Actualizar base de datos
      const user = await this.db.incrementUserStats(socketId, {
        balance: newBalance,
        totalWins: winAmount,
      });

      logger.info(
        `[${this.instanceName}] 💰 Cashout: ${
          player.name
        } - $${winAmount.toFixed(2)} (${multiplier.toFixed(2)}x)`
      );

      return {
        success: true,
        winAmount,
        multiplier,
        balance: newBalance,
        userId: user._id.toString(),
        playerName: player.name,
      };
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en cashout:`, error);
      return { success: false, error: "Error interno" };
    }
  }

  /**
   * Obtiene la lista actual de jugadores
   */
  async getAllPlayers() {
    return await this.redis.getAllPlayers();
  }

  /**
   * Obtiene el número de jugadores conectados
   */
  async getPlayerCount() {
    return await this.redis.getPlayerCount();
  }

  /**
   * Resetea las apuestas de todos los jugadores
   */
  async resetAllBets() {
    await this.redis.resetAllPlayerBets();
    logger.info(`[${this.instanceName}] 🔄 Apuestas reseteadas`);
  }
}

module.exports = PlayerManager;
