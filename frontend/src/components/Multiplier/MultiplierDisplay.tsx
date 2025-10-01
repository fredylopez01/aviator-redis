// components/Multiplier/MultiplierDisplay.tsx
import { RoundState } from "../../types/types";
import {
  MULTIPLIER_COLORS,
  ROUND_STATE_MESSAGES,
} from "../../constants/game.constants";

interface MultiplierDisplayProps {
  multiplier: number;
  roundState: RoundState;
  message?: string;
}

export const MultiplierDisplay = ({
  multiplier,
  roundState,
  message,
}: MultiplierDisplayProps) => {
  const getMultiplierColor = (): string => {
    if (roundState === "crashed") return MULTIPLIER_COLORS.CRASHED;
    if (roundState === "running") return MULTIPLIER_COLORS.RUNNING;
    return MULTIPLIER_COLORS.DEFAULT;
  };

  return (
    <div className="multiplier-display" style={{ color: getMultiplierColor() }}>
      <h2>{multiplier.toFixed(2)}x</h2>
      <p className="round-state">{ROUND_STATE_MESSAGES[roundState]}</p>
      {message && <p className="message">{message}</p>}
    </div>
  );
};
