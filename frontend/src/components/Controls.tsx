import { useState } from "react";
import "./Controls.css";

interface ControlsProps {
  onBet: (amount: number) => void;
  onCashout: () => void;
  canBet: boolean;
  canCashout: boolean;
  currentBalance: number;
}

function Controls({
  onBet,
  onCashout,
  canBet,
  canCashout,
  currentBalance,
}: ControlsProps) {
  const [amount, setAmount] = useState<number>(10);

  const handleBet = () => {
    if (amount > 0 && amount <= currentBalance) {
      onBet(amount);
    }
  };

  return (
    <div className="controls">
      <div className="bet-section">
        <input
          type="number"
          min="10"
          max="500"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={!canBet}
        />
      </div>

      <div className="btn-controls">
        <button
          onClick={onCashout}
          disabled={!canCashout}
          className="cashout-button"
        >
          Retirarse
        </button>
        <button
          onClick={handleBet}
          disabled={!canBet || amount <= 0 || amount > currentBalance}
          className="bet-button"
        >
          Apostar ${amount}
        </button>
      </div>

      <div className="quick-bets">
        <button onClick={() => setAmount(10)} disabled={!canBet}>
          $10
        </button>
        <button onClick={() => setAmount(50)} disabled={!canBet}>
          $50
        </button>
        <button onClick={() => setAmount(100)} disabled={!canBet}>
          $100
        </button>
      </div>
    </div>
  );
}

export default Controls;
