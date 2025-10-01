// backend/src/game/LeaderElection.js
const logger = require("../utils/logger");

class LeaderElection {
  constructor(redisService, instanceName) {
    this.redis = redisService;
    this.instanceName = instanceName;
    this.isLeader = false;
    this.heartbeatInterval = null;
  }

  /**
   * Intenta convertirse en líder
   */
  async tryBecomeLeader() {
    try {
      const acquired = await this.redis.tryAcquireLeadership(
        this.instanceName,
        10
      );

      if (acquired) {
        this.isLeader = true;
        logger.info(`[${this.instanceName}] 👑 SOY EL LÍDER`);
        this.startHeartbeat();
        return true;
      } else {
        this.isLeader = false;
        logger.info(`[${this.instanceName}] 📡 Modo seguidor`);

        // Reintentar en 10 segundos
        setTimeout(() => this.tryBecomeLeader(), 10000);
        return false;
      }
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en tryBecomeLeader:`, error);
      return false;
    }
  }

  /**
   * Inicia el heartbeat para mantener el liderazgo
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.redis.renewLeadership(10);
      } catch (error) {
        logger.error(
          `[${this.instanceName}] Error renovando liderazgo:`,
          error
        );
        this.loseLeadership();
      }
    }, 5000);
  }

  /**
   * Pierde el liderazgo y reintenta
   */
  loseLeadership() {
    logger.warn(`[${this.instanceName}] ⚠️ Perdí el liderazgo`);
    this.isLeader = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Reintentar ser líder
    setTimeout(() => this.tryBecomeLeader(), 1000);
  }

  /**
   * Detiene el proceso de liderazgo
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.isLeader = false;
  }

  /**
   * Verifica si esta instancia es el líder
   */
  checkIsLeader() {
    return this.isLeader;
  }
}

module.exports = LeaderElection;
