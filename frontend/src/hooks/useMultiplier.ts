// hooks/useMultiplier.ts
import { useState, useRef, useEffect, useCallback } from "react";
import { GAME_CONFIG } from "../constants/game.constants";
import {
  calculateMultiplier,
  getDelayUntilStart,
} from "../utils/multiplier.utils";

export const useMultiplier = () => {
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const roundStartTime = useRef<number | null>(null);
  const multiplierInterval = useRef<number | null>(null);

  const clearMultiplierInterval = useCallback(() => {
    if (multiplierInterval.current) {
      clearInterval(multiplierInterval.current);
      multiplierInterval.current = null;
    }
  }, []);

  const startMultiplierLoop = useCallback(() => {
    if (!roundStartTime.current) return;

    multiplierInterval.current = setInterval(() => {
      if (!roundStartTime.current) {
        clearMultiplierInterval();
        return;
      }

      const newMultiplier = calculateMultiplier(roundStartTime.current);
      setMultiplier(newMultiplier);
    }, GAME_CONFIG.UPDATE_INTERVAL);
  }, [clearMultiplierInterval]);

  const startMultiplierAnimation = useCallback(
    (startTime: number) => {
      clearMultiplierInterval();
      roundStartTime.current = startTime;

      const delay = getDelayUntilStart(startTime);

      if (delay > 0) {
        setTimeout(() => {
          startMultiplierLoop();
        }, delay);
      } else {
        startMultiplierLoop();
      }
    },
    [clearMultiplierInterval, startMultiplierLoop]
  );

  const stopMultiplierAnimation = useCallback(() => {
    clearMultiplierInterval();
    roundStartTime.current = null;
  }, [clearMultiplierInterval]);

  useEffect(() => {
    return () => {
      clearMultiplierInterval();
    };
  }, [clearMultiplierInterval]);

  return {
    multiplier,
    setMultiplier,
    startMultiplierAnimation,
    stopMultiplierAnimation,
  };
};
