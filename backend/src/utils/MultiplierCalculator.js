// backend/src/utils/MultiplierCalculator.js
const config = require("../config/gameConfig");

class MultiplierCalculator {
  /**
   * Calcula el multiplicador actual basado en el tiempo transcurrido
   */
  static calculateMultiplier(startTime) {
    const elapsed = Date.now() - startTime;
    if (elapsed < 0) return 1.0;

    const ticks = Math.floor(elapsed / config.tickInterval);
    return parseFloat((1.0 + ticks * config.tickIncrement).toFixed(2));
  }

  /**
   * Calcula la duración de una ronda dado el crash point
   */
  static calculateRoundDuration(crashPoint) {
    // crashPoint = 1.0 + (ticks * tickIncrement)
    // ticks = (crashPoint - 1.0) / tickIncrement
    const ticks = (crashPoint - 1.0) / config.tickIncrement;
    return ticks * config.tickInterval;
  }

  /**
   * Genera un crash point aleatorio usando la distribución de probabilidad
   */
  static generateCrashPoint() {
    const random = Math.random();
    const crashPoint = Math.max(
      1.01,
      Math.floor((99 / (100 * random - random)) * 100) / 100
    );
    return crashPoint;
  }

  /**
   * Calcula timestamps para una nueva ronda
   */
  static calculateRoundTimestamps(waitTimeMs = 5000) {
    const now = Date.now();
    const crashPoint = this.generateCrashPoint();
    const startTime = now + waitTimeMs;
    const durationMs = this.calculateRoundDuration(crashPoint);
    const crashTime = startTime + durationMs;

    return {
      crashPoint,
      createdAt: now,
      startTime,
      crashTime,
      durationMs,
    };
  }

  /**
   * Calcula la ganancia de un jugador
   */
  static calculateWinAmount(betAmount, multiplier) {
    return parseFloat((betAmount * multiplier).toFixed(2));
  }

  /**
   * Valida si un multiplicador es válido para cashout
   */
  static isValidCashoutMultiplier(multiplier, crashPoint) {
    return multiplier > 0 && multiplier < crashPoint;
  }
}

module.exports = MultiplierCalculator;
