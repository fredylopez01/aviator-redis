import { useState, useEffect } from "react";
import { BET_LIMITS, QUICK_BET_AMOUNTS } from "../../constants/game.constants";
import "./Controls.css";

interface ControlsProps {
  onBet: (amount: number) => void;
  onCashout: () => void;
  canBet: boolean;
  canCashout: boolean;
  currentBalance: number;
}

export const Controls = ({
  onBet,
  onCashout,
  canBet,
  canCashout,
  currentBalance,
}: ControlsProps) => {
  const [amount, setAmount] = useState<number>(BET_LIMITS.MIN);

  // Resetear amount cuando se pueda apostar de nuevo
  useEffect(() => {
    if (canBet && amount > currentBalance) {
      setAmount(BET_LIMITS.MIN);
    }
  }, [canBet, currentBalance, amount]);

  const handleBet = () => {
    console.log("🎯 Control: Bet button clicked, amount:", amount);
    if (amount > 0 && amount <= currentBalance) {
      onBet(amount);
    } else {
      console.warn("⚠️ Apuesta inválida:", { amount, currentBalance });
    }
  };

  const handleCashout = () => {
    console.log("💰 Control: Cashout button clicked");
    onCashout();
  };

  const isValidBet = canBet && amount > 0 && amount <= currentBalance;

  return (
    <div className="controls">
      <div className="bet-section">
        <input
          type="number"
          min={BET_LIMITS.MIN}
          max={BET_LIMITS.MAX}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={!canBet}
        />
      </div>

      <div className="btn-controls">
        <button
          onClick={handleCashout}
          disabled={!canCashout}
          className="cashout-button"
          title={
            !canCashout
              ? "No puedes retirarte ahora"
              : "Retirarse en este multiplicador"
          }
        >
          Retirarse
        </button>
        <button
          onClick={handleBet}
          disabled={!isValidBet}
          className="bet-button"
          title={
            !canBet
              ? "Espera el periodo de apuestas"
              : !isValidBet
              ? "Verifica el monto"
              : "Realizar apuesta"
          }
        >
          Apostar ${amount}
        </button>
      </div>

      <div className="quick-bets">
        {QUICK_BET_AMOUNTS.map((quickAmount) => (
          <button
            key={quickAmount}
            onClick={() => setAmount(quickAmount)}
            disabled={!canBet || quickAmount > currentBalance}
          >
            ${quickAmount}
          </button>
        ))}
      </div>
    </div>
  );
};
