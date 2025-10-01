// components/PlayerList/PlayerList.tsx
import { Player } from "../../types/types";
import "./PlayerList.css";

interface PlayerListProps {
  players: Player[];
}

export const PlayerList = ({ players }: PlayerListProps) => {
  return (
    <div className="player-list">
      <h3>Jugadores ({players.length})</h3>
      <div className="players-container">
        {players.length === 0 ? (
          <p className="no-players">No hay jugadores conectados</p>
        ) : (
          players.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))
        )}
      </div>
    </div>
  );
};

interface PlayerCardProps {
  player: Player;
}

const PlayerCard = ({ player }: PlayerCardProps) => {
  const hasActiveBet = player.bet > 0;
  const hasCashedOut = player.cashedOut && player.win > 0;

  return (
    <div className="player-card">
      <div className="player-name">{player.name}</div>
      <div className="player-balance">💰 ${player.balance}</div>
      {hasActiveBet && (
        <div className="player-bet">
          🎯 Apostó: ${player.bet}
          {hasCashedOut && (
            <span className="player-win">
              {" "}
              → Ganó: ${player.win.toFixed(2)}
            </span>
          )}
        </div>
      )}
      {hasActiveBet && !player.cashedOut && (
        <div className="player-status">En juego...</div>
      )}
    </div>
  );
};
