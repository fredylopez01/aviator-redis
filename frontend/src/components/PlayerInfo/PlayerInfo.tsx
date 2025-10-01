// components/PlayerInfo/PlayerInfo.tsx
import { Player } from "../../types/types";

interface PlayerInfoProps {
  player: Player;
  roundNumber: number;
}

export const PlayerInfo = ({ player, roundNumber }: PlayerInfoProps) => {
  return (
    <div className="player-info">
      <p className="balance-value">${player.balance.toFixed(2)} USD</p>
      <p>Bienvenido, {player.name}!</p>
      <p className="round-info">Ronda #{roundNumber}</p>
      {player.bet > 0 && <p>Apuesta actual: ${player.bet.toFixed(2)}</p>}
      {player.win > 0 && (
        <p className="win-amount">Ganancia: ${player.win.toFixed(2)}</p>
      )}
    </div>
  );
};
