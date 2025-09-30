import "./PlayerList.css";

interface Player {
  id: string;
  name: string;
  balance: number;
  bet: number;
  cashedOut: boolean;
  win: number;
}

interface PlayerListProps {
  players: Player[];
}

function PlayerList({ players }: PlayerListProps) {
  return (
    <div className="player-list">
      <h3>Jugadores ({players.length})</h3>
      <div className="players-container">
        {players.map((player) => (
          <div key={player.id} className="player-card">
            <div className="player-name">{player.name}</div>
            <div className="player-balance">💰 ${player.balance}</div>
            {player.bet > 0 && (
              <div className="player-bet">
                🎯 Apostó: ${player.bet}
                {player.cashedOut && player.win > 0 && (
                  <span className="player-win">
                    {" "}
                    → Ganó: ${player.win.toFixed(2)}
                  </span>
                )}
              </div>
            )}
            {player.bet > 0 && !player.cashedOut && (
              <div className="player-status">En juego...</div>
            )}
          </div>
        ))}
        {players.length === 0 && (
          <p className="no-players">No hay jugadores conectados</p>
        )}
      </div>
    </div>
  );
}

export default PlayerList;
