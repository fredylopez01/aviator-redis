import { io, Socket } from "socket.io-client";
import { SERVER_CONFIG } from "../constants/game.constants";

class SocketManager {
  private socket: Socket | null = null;
  private connected = false;
  private currentPlayerName: string | null = null;
  private isConnecting = false;

  connect(): Socket {
    // Si ya existe socket, retornarlo
    if (this.socket) {
      console.log("♻️ Reutilizando socket existente");
      return this.socket;
    }

    // Si está en proceso de conexión, esperar
    if (this.isConnecting) {
      console.log("⏳ Conexión en progreso...");
      return this.socket!;
    }

    this.isConnecting = true;
    console.log("🔌 Creando nueva conexión de socket...");

    this.socket = io(SERVER_CONFIG.URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: SERVER_CONFIG.RECONNECTION_DELAY,
      reconnectionDelayMax: SERVER_CONFIG.RECONNECTION_DELAY_MAX,
      reconnectionAttempts: SERVER_CONFIG.RECONNECTION_ATTEMPTS,
      timeout: SERVER_CONFIG.TIMEOUT,
    });

    this.setupEventHandlers();
    this.connected = true;
    this.isConnecting = false;

    return this.socket;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("✅ Conectado al servidor:", this.socket?.id);
      this.connected = true;

      // NO re-enviar join automáticamente aquí
      // Eso lo maneja useGameSocket
    });

    this.socket.on("disconnect", (reason) => {
      console.warn("❌ Desconectado del servidor:", reason);
      this.connected = false;
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`✅ Reconectado después de ${attemptNumber} intentos`);

      // Solo reenviar join si había un jugador
      if (this.currentPlayerName) {
        console.log("🔄 Reintentando unirse con:", this.currentPlayerName);
        this.socket?.emit("join", this.currentPlayerName);
      }
    });

    this.socket.on("reconnect_error", (error) => {
      console.error("❌ Error de reconexión:", error);
    });

    this.socket.on("reconnecting", (attemptNumber) => {
      console.log(`🔄 Intento de reconexión #${attemptNumber}`);
    });

    this.socket.on("reconnect_failed", () => {
      console.error("❌ Falló la reconexión después de todos los intentos");
    });
  }

  setPlayerName(name: string): void {
    this.currentPlayerName = name;
  }

  disconnect(): void {
    if (this.socket) {
      console.log("🔌 Desconectando socket...");
      this.currentPlayerName = null;
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.isConnecting = false;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.connected && (this.socket?.connected || false);
  }

  emit(event: string, ...args: any[]): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, ...args);
    } else {
      console.warn(`⚠️ No se puede emitir "${event}": socket no conectado`);
    }
  }
}

export const socketManager = new SocketManager();
