const redis = require("redis");
const logger = require("../utils/logger");

// Variables para almacenar las instancias de los clientes.
let client = null; // Para operaciones de caching generales (GET/SET).
let publisher = null; // Dedicado a publicar mensajes (Pub/Sub).
let subscriber = null; // Dedicado a suscribirse a canales (Pub/Sub).

// Función asíncrona principal para inicializar y conectar los clientes Redis.
const connectRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    // Cliente principal para operaciones generales de almacenamiento en caché.
    client = redis.createClient({
      url: redisUrl,
      socket: {
        // **reconnectStrategy**: Lógica de reintento de conexión.
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            // Falla si se excede el límite de 10 reintentos.
            logger.error("Demasiados reintentos de conexión a Redis");
            return new Error("Demasiados reintentos");
          }
          // Retraso exponencial de reintento, limitado a 3 segundos (3000ms).
          return Math.min(retries * 100, 3000);
        },
      },
    });

    // **publisher = client.duplicate()**: Crea una copia del cliente.
    // Esto es NECESARIO porque el cliente principal puede estar ocupado con comandos.
    // El 'publisher' se usará para el patrón Pub/Sub.
    publisher = client.duplicate();

    // **subscriber = client.duplicate()**: Crea otra copia del cliente.
    // Esto es VITAL: el cliente 'subscriber' se bloquea al esperar mensajes (LISTEN/SUBSCRIBE).
    // Necesita ser una conexión separada para no bloquear las operaciones del 'client' ni del 'publisher'.
    subscriber = client.duplicate();

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

    // **await Promise.all(...)**: Conecta los tres clientes simultáneamente.
    await Promise.all([
      client.connect(),
      publisher.connect(),
      subscriber.connect(),
    ]);

    logger.info("Redis conectado exitosamente");

    // Retorna los clientes conectados para que puedan ser usados por otros servicios.
    return { client, publisher, subscriber };
  } catch (error) {
    logger.error("Error conectando a Redis:", error);
    throw error;
  }
};

// Función para obtener los clientes ya conectados.
const getRedisClients = () => {
  // Asegura que los clientes existan y estén conectados antes de ser retornados.
  if (!client || !publisher || !subscriber) {
    throw new Error("Redis no está conectado");
  }
  return { client, publisher, subscriber };
};

// Función para desconectar y limpiar los clientes Redis.
const closeRedis = async () => {
  try {
    // Usa 'quit()' para cerrar la conexión de manera elegante.
    if (client) await client.quit();
    if (publisher) await publisher.quit();
    if (subscriber) await subscriber.quit();
    logger.info("Redis desconectado");
  } catch (error) {
    logger.error("Error cerrando Redis:", error);
  }
};

// Exporta las funciones clave.
module.exports = {
  connectRedis,
  getRedisClients,
  closeRedis,
};
