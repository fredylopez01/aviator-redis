import { useState, useCallback } from "react";
import { socketManager } from "./services/socketManager";
import { Game } from "./components/Game/Game";
import { Login } from "./components/Login/Login";
import "./App.css";

function App() {
  const [player, setPlayer] = useState<{ name: string } | null>(null);

  const handleJoin = useCallback((name: string) => {
    // Solo guardamos el nombre, NO conectamos aquí
    setPlayer({ name });
  }, []);

  const handleLeave = useCallback(() => {
    socketManager.disconnect();
    setPlayer(null);
  }, []);

  return (
    <div className="app">
      {!player ? (
        <Login onJoin={handleJoin} connecting={false} />
      ) : (
        <>
          <Game player={player} />
          <button
            onClick={handleLeave}
            className="leave-button"
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              padding: "5px 10px",
              backgroundColor: "#ff4444",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Salir
          </button>
        </>
      )}
    </div>
  );
}

export default App;
