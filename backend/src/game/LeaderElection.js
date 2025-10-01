const logger = require("../utils/logger");

class LeaderElection {
  constructor(redisService, instanceName) {
    this.redis = redisService; // Servicio Redis para la comunicación.
    this.instanceName = instanceName; // Nombre único de esta instancia (ej. backend-1).
    this.isLeader = false; // Bandera que indica el estado actual.
    this.heartbeatInterval = null; // ID del temporizador para mantener el liderazgo.
  }

  /**
   * Intenta convertirse en líder
   */
  async tryBecomeLeader() {
    try {
      // Intenta adquirir el 'lock' de liderazgo en Redis.
      // Usa un TTL de **5 segundos**.
      const acquired = await this.redis.tryAcquireLeadership(
        this.instanceName,
        5 // TTL: Si la instancia falla, la llave expira en 5 segundos.
      );

      if (acquired) {
        this.isLeader = true;
        logger.info(`[${this.instanceName}] 👑 SOY EL LÍDER`);
        // Inicia el mecanismo de Heartbeat para renovar el 'lock'.
        this.startHeartbeat();
        return true;
      } else {
        this.isLeader = false;
        logger.info(`[${this.instanceName}] 📡 Modo seguidor`);
        // Si falla la adquisición (otro es el líder), reintenta en 5 segundos.
        setTimeout(() => this.tryBecomeLeader(), 5000);
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

    // **setInterval**: Configura un latido periódico.
    this.heartbeatInterval = setInterval(async () => {
      try {
        // Renueva el TTL de la llave "game:leader" a 5 segundos.
        await this.redis.renewLeadership(5);
      } catch (error) {
        logger.error(
          `[${this.instanceName}] Error renovando liderazgo:`,
          error
        );
        // Si falla la renovación (ej. Redis cayó), asume que perdió el liderazgo.
        this.loseLeadership();
      }
    }, 3000);
  }

  /**
   * Pierde el liderazgo y reintenta
   */
  loseLeadership() {
    logger.warn(`[${this.instanceName}] ⚠️ Perdí el liderazgo`);
    this.isLeader = false;
    // Detiene el Heartbeat.
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    // Reintenta adquirir el liderazgo después de 1 segundo (rápida transición).
    setTimeout(() => this.tryBecomeLeader(), 1000);
  }

  /**
   * Detiene el proceso de liderazgo
   */
  stop() {
    // Limpieza al cerrar la instancia.
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
