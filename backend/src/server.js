require("dotenv").config();
const { createServer } = require("http");
const app = require("./app");
const { Server } = require("socket.io");
const registerGameSocket = require("./sockets/gameSocket");
const logger = require("./utils/logger");
const connectDB = require("./config/database");
const { connectRedis, closeRedis } = require("./config/redis");

const PORT = process.env.PORT || 3000;
const INSTANCE_NAME = process.env.INSTANCE_NAME || "backend";

async function startServer() {
  try {
    // Conectar a MongoDB
    await connectDB();

    // 2. Conexión a Redis (caching, estado, y comunicación inter-backend).
    await connectRedis();

    // 3. Creación del servidor HTTP usando la aplicación Express.
    const httpServer = createServer(app);
    // 4. Inicialización del servidor Socket.IO y lo adjunta al servidor HTTP.
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      // **transports**: Define los mecanismos de comunicación a usar (websockets, luego polling).
      transports: ["websocket", "polling"],
    });

    // 5. **io.on("connection", ...)**: Evento principal de Socket.IO.
    // Se ejecuta CADA VEZ que un cliente frontend se conecta.
    io.on("connection", (socket) => registerGameSocket(io, socket));

    // 6. Iniciar la escucha del servidor en el puerto definido.
    httpServer.listen(PORT, () => {
      logger.info(
        // Muestra el nombre de la instancia para fácil identificación en logs.
        `[${INSTANCE_NAME}] Servidor Aviator escuchando en http://localhost:${PORT}`
      );
    });

    // Opcional: retorna los servidores por si se necesitan pruebas o más configuración.
    return { httpServer, io };
  } catch (error) {
    logger.error("Error iniciando servidor:", error);
    process.exit(1);
  }
}

/**
 * SIGINT: Señal enviada al proceso (ej. Ctrl+C o la mayoría de orquestadores de contenedores).
 */
process.on("SIGINT", async () => {
  logger.info(`[${INSTANCE_NAME}] Cerrando servidor (SIGINT)...`);
  // **Limpieza Crítica**: Cierra las conexiones de Redis de forma limpia.
  await closeRedis();
  process.exit(0);
});

/**
 * SIGTERM: Señal de terminación enviada por orquestadores (Docker, Kubernetes) antes de matar el proceso.
 */
process.on("SIGTERM", async () => {
  logger.info(`[${INSTANCE_NAME}] Recibido SIGTERM, cerrando servidor...`);
  await closeRedis();
  process.exit(0);
});

// Llama a la función de inicio.
startServer();
