import { io, Socket } from "socket.io-client";

class SocketManager {
  private socket: Socket | null = null;
  private connected = false;
  private currentPlayerName: string | null = null;

  connect() {
    if (!this.socket || !this.connected) {
      // URL del servidor - cambiar según tu configuración
      // Para mismo PC: "http://localhost" o "http://localhost:80"
      // Para otro PC en LAN: "http://192.168.1.X" (IP del servidor)
      const SERVER_URL = "http://localhost";

      this.socket = io(SERVER_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
      });

      this.setupEventHandlers();
      this.connected = true;
      console.log("Socket configurado con reconexión automática");
    }
    return this.socket;
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    // Evento de conexión exitosa
    this.socket.on("connect", () => {
      console.log("✅ Conectado al servidor:", this.socket?.id);
      this.connected = true;

      // Si ya había un jugador, reintentar unirse automáticamente
      if (this.currentPlayerName) {
        console.log("🔄 Reintentando unirse con:", this.currentPlayerName);
        this.socket?.emit("join", this.currentPlayerName);
      }
    });

    // Evento de desconexión
    this.socket.on("disconnect", (reason) => {
      console.warn("❌ Desconectado del servidor:", reason);
      this.connected = false;
    });

    // Evento de reconexión
    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`✅ Reconectado después de ${attemptNumber} intentos`);
    });

    // Evento de error de reconexión
    this.socket.on("reconnect_error", (error) => {
      console.error("❌ Error de reconexión:", error);
    });

    // Evento cuando está intentando reconectar
    this.socket.on("reconnecting", (attemptNumber) => {
      console.log(`🔄 Intento de reconexión #${attemptNumber}`);
    });

    // Evento cuando falla completamente la reconexión
    this.socket.on("reconnect_failed", () => {
      console.error("❌ Falló la reconexión después de todos los intentos");
    });
  }

  // Método para guardar el nombre del jugador actual
  setPlayerName(name: string) {
    this.currentPlayerName = name;
  }

  disconnect() {
    if (this.socket && this.connected) {
      this.currentPlayerName = null;
      this.socket.disconnect();
      this.connected = false;
      this.socket = null;
      console.log("Socket desconectado");
    }
  }

  getSocket() {
    return this.socket;
  }

  isConnected() {
    return this.connected && this.socket?.connected;
  }

  getConnectionStatus() {
    return {
      connected: this.connected,
      socketConnected: this.socket?.connected || false,
      socketId: this.socket?.id || null,
    };
  }
}

// Exportar instancia singleton
export const socketManager = new SocketManager();

// Para compatibilidad con el código existente
export default socketManager;
