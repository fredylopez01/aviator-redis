// utils/multiplier.utils.ts
import { GAME_CONFIG } from "../constants/game.constants";

export const calculateMultiplier = (startTime: number): number => {
  const elapsed = Date.now() - startTime;
  if (elapsed < 0) return 1.0;

  const ticks = Math.floor(elapsed / GAME_CONFIG.TICK_INTERVAL);
  const calculatedMultiplier = 1.0 + ticks * GAME_CONFIG.TICK_INCREMENT;

  return parseFloat(calculatedMultiplier.toFixed(2));
};

export const getDelayUntilStart = (startTime: number): number => {
  return startTime - Date.now();
};
