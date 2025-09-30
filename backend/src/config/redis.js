const redis = require("redis");
const logger = require("../utils/logger");

let client = null;
let publisher = null;
let subscriber = null;

const connectRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    // Cliente principal para operaciones generales
    client = redis.createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error("Demasiados reintentos de conexión a Redis");
            return new Error("Demasiados reintentos");
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    // Cliente para publicar mensajes
    publisher = client.duplicate();

    // Cliente para suscribirse a canales
    subscriber = client.duplicate();

    // Eventos de conexión
    client.on("error", (err) => logger.error("Error en Redis Client:", err));
    publisher.on("error", (err) =>
      logger.error("Error en Redis Publisher:", err)
    );
    subscriber.on("error", (err) =>
      logger.error("Error en Redis Subscriber:", err)
    );

    client.on("connect", () => logger.info("Redis Client conectado"));
    publisher.on("connect", () => logger.info("Redis Publisher conectado"));
    subscriber.on("connect", () => logger.info("Redis Subscriber conectado"));

    // Conectar todos los clientes
    await Promise.all([
      client.connect(),
      publisher.connect(),
      subscriber.connect(),
    ]);

    logger.info("Redis conectado exitosamente");

    return { client, publisher, subscriber };
  } catch (error) {
    logger.error("Error conectando a Redis:", error);
    throw error;
  }
};

const getRedisClients = () => {
  if (!client || !publisher || !subscriber) {
    throw new Error("Redis no está conectado");
  }
  return { client, publisher, subscriber };
};

const closeRedis = async () => {
  try {
    if (client) await client.quit();
    if (publisher) await publisher.quit();
    if (subscriber) await subscriber.quit();
    logger.info("Redis desconectado");
  } catch (error) {
    logger.error("Error cerrando Redis:", error);
  }
};

module.exports = {
  connectRedis,
  getRedisClients,
  closeRedis,
};
