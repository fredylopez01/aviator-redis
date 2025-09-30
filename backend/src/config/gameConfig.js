module.exports = {
  // Configuración de apuestas
  minBet: 1,
  maxBet: 1000,
  initialBalance: 1000,

  // Configuración de ronda
  waitTime: 5000, // 5 segundos de espera entre rondas
  tickInterval: 100, // Cada 100ms se actualiza el multiplicador
  tickIncrement: 0.01, // Se incrementa 0.01 cada tick

  // Configuración del crash
  minCrashPoint: 1.01,
  maxCrashPoint: 10.0,

  // Función para calcular el punto de crash
  generateCrashPoint: () => {
    // Algoritmo simple para generar crash point
    // Puedes hacer esto más complejo más adelante
    const random = Math.random();

    if (random < 0.5) {
      // 50% probabilidad de crash entre 1.01 y 2.0
      return parseFloat((1.01 + Math.random() * 0.99).toFixed(2));
    } else if (random < 0.8) {
      // 30% probabilidad de crash entre 2.0 y 5.0
      return parseFloat((2.0 + Math.random() * 3.0).toFixed(2));
    } else {
      // 20% probabilidad de crash entre 5.0 y 10.0
      return parseFloat((5.0 + Math.random() * 5.0).toFixed(2));
    }
  },

  // Configuración de Redis
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
};
