import { useState } from "react";

interface LoginProps {
  onJoin: (name: string) => void;
  connecting: boolean;
}

export const Login = ({ onJoin, connecting }: LoginProps) => {
  const [name, setName] = useState("");

  const handleSubmit = () => {
    if (name.trim() !== "") {
      onJoin(name.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="login">
      <h1>Aviator Game</h1>
      <input
        type="text"
        placeholder="Ingresa tu nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={connecting}
        onKeyPress={handleKeyPress}
        autoFocus
      />
      <button
        onClick={handleSubmit}
        disabled={connecting || name.trim() === ""}
      >
        {connecting ? "Conectando..." : "Entrar"}
      </button>
    </div>
  );
};
