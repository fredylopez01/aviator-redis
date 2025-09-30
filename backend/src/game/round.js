const config = require("../config/gameConfig");

class Round {
  constructor() {
    this.state = "waiting"; // waiting | running | crashed
    this.multiplier = 1.0;
    this.crashPoint = config.generateCrashPoint
      ? config.generateCrashPoint()
      : this.generateCrashPoint();
    this.interval = null;
  }

  generateCrashPoint() {
    return parseFloat(
      (
        Math.random() * (config.maxCrashPoint - config.minCrashPoint) +
        config.minCrashPoint
      ).toFixed(2)
    );
  }

  reset() {
    this.state = "waiting";
    this.multiplier = 1.0;
    this.crashPoint = config.generateCrashPoint
      ? config.generateCrashPoint()
      : this.generateCrashPoint();
    this.interval = null;
  }
}

module.exports = Round;
