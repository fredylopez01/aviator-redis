// constants/game.constants.ts
export const GAME_CONFIG = {
  TICK_INTERVAL: 100, // 100ms
  TICK_INCREMENT: 0.01, // 0.01 por tick
  UPDATE_INTERVAL: 50, // 50ms para animación suave
  MESSAGE_TIMEOUT: 3000, // 3 segundos
} as const;

export const SERVER_CONFIG = {
  URL: "http://localhost",
  RECONNECTION_DELAY: 1000,
  RECONNECTION_DELAY_MAX: 5000,
  RECONNECTION_ATTEMPTS: Infinity,
  TIMEOUT: 20000,
} as const;

export const QUICK_BET_AMOUNTS = [10, 50, 100] as const;

export const BET_LIMITS = {
  MIN: 10,
  MAX: 500,
} as const;

export const MULTIPLIER_COLORS = {
  CRASHED: "#ff4444",
  RUNNING: "#00ff00",
  DEFAULT: "#ffffff",
} as const;

export const ROUND_STATE_MESSAGES = {
  waiting: "⏳ Esperando...",
  running: "🚀 ¡Volando!",
  crashed: "💥 Crashed",
} as const;
