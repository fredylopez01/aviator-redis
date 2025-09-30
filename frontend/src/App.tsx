import { useState } from "react";
import "./App.css";
import Game from "./components/Game";
import { socketManager } from "./socket";

function App() {
  const [player, setPlayer] = useState<{ name: string } | null>(null);
  const [name, setName] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleJoin = () => {
    if (name.trim() !== "") {
      setConnecting(true);

      // AQUÍ es donde se conecta el socket por primera vez
      const socket = socketManager.connect();

      socket.on("connect", () => {
        console.log("Socket conectado exitosamente");
        setPlayer({ name: name.trim() });
        setConnecting(false);
      });

      socket.on("connect_error", (error) => {
        console.error("Error conectando socket:", error);
        setConnecting(false);
        alert("Error conectando al servidor");
      });
    }
  };

  const handleLeave = () => {
    socketManager.disconnect();
    setPlayer(null);
    setName("");
  };

  return (
    <div className="app">
      {!player ? (
        <div className="login">
          <h1>Aviator Game</h1>
          <input
            type="text"
            placeholder="Ingresa tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={connecting}
            onKeyPress={(e) => e.key === "Enter" && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={connecting || name.trim() === ""}
          >
            {connecting ? "Conectando..." : "Entrar"}
          </button>
        </div>
      ) : (
        <div>
          <Game player={player} />
          <button
            onClick={handleLeave}
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
        </div>
      )}
    </div>
  );
}

export default App;
