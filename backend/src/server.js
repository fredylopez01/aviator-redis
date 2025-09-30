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

    // Conectar a Redis
    await connectRedis();

    const httpServer = createServer(app);
    const io = new Server(httpServer, {
      cors: { origin: "*" },
      transports: ["websocket", "polling"],
    });

    // Registrar eventos de sockets
    io.on("connection", (socket) => registerGameSocket(io, socket));

    httpServer.listen(PORT, () => {
      logger.info(
        `[${INSTANCE_NAME}] Servidor Aviator escuchando en http://localhost:${PORT}`
      );
    });

    return { httpServer, io };
  } catch (error) {
    logger.error("Error iniciando servidor:", error);
    process.exit(1);
  }
}

// Manejar cierre graceful
process.on("SIGINT", async () => {
  logger.info(`[${INSTANCE_NAME}] Cerrando servidor...`);
  await closeRedis();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info(`[${INSTANCE_NAME}] Recibido SIGTERM, cerrando servidor...`);
  await closeRedis();
  process.exit(0);
});

startServer();
