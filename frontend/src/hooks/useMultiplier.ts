// frontend/src/hooks/useMultiplier.ts
import { useState, useRef, useEffect } from "react";

const TICK_INTERVAL = 100; // 100ms
const TICK_INCREMENT = 0.01; // 0.01 por tick

interface UseMultiplierReturn {
  multiplier: number;
  startMultiplierAnimation: (startTime: number) => void;
  stopMultiplierAnimation: () => void;
  setMultiplier: (value: number) => void;
}

export const useMultiplier = (): UseMultiplierReturn => {
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const roundStartTime = useRef<number | null>(null);
  const multiplierInterval = useRef<number | null>(null);

  // Calcular multiplicador basado en timestamp del servidor
  const calculateMultiplier = (startTime: number): number => {
    const elapsed = Date.now() - startTime;
    if (elapsed < 0) return 1.0;

    const ticks = Math.floor(elapsed / TICK_INTERVAL);
    const calculatedMultiplier = 1.0 + ticks * TICK_INCREMENT;

    return parseFloat(calculatedMultiplier.toFixed(2));
  };

  // Limpiar intervalo
  const clearMultiplierInterval = () => {
    if (multiplierInterval.current) {
      clearInterval(multiplierInterval.current);
      multiplierInterval.current = null;
    }
  };

  // Loop de actualización del multiplicador
  const startMultiplierLoop = () => {
    if (!roundStartTime.current) return;

    // Actualizar cada 50ms para animación suave
    multiplierInterval.current = setInterval(() => {
      if (!roundStartTime.current) {
        clearMultiplierInterval();
        return;
      }

      const newMultiplier = calculateMultiplier(roundStartTime.current);
      setMultiplier(newMultiplier);
    }, 50);
  };

  // Iniciar animación del multiplicador
  const startMultiplierAnimation = (startTime: number) => {
    clearMultiplierInterval();
    roundStartTime.current = startTime;

    // Calcular cuánto tiempo falta para que inicie
    const delay = startTime - Date.now();

    if (delay > 0) {
      // Esperar hasta el inicio exacto
      setTimeout(() => {
        startMultiplierLoop();
      }, delay);
    } else {
      // Ya inició, empezar inmediatamente
      startMultiplierLoop();
    }
  };

  // Detener animación
  const stopMultiplierAnimation = () => {
    clearMultiplierInterval();
    roundStartTime.current = null;
  };

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      clearMultiplierInterval();
    };
  }, []);

  return {
    multiplier,
    startMultiplierAnimation,
    stopMultiplierAnimation,
    setMultiplier,
  };
};
