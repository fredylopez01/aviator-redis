// hooks/useMessageTimeout.ts
import { useEffect } from "react";
import { GAME_CONFIG } from "../constants/game.constants";

export const useMessageTimeout = (message: string, onClear: () => void) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClear, GAME_CONFIG.MESSAGE_TIMEOUT);
      return () => clearTimeout(timer);
    }
  }, [message, onClear]);
};
