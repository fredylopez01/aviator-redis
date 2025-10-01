const mongoose = require("mongoose");
const logger = require("../utils/logger");

// Define la función asíncrona principal para conectar a la DB.
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // **readPreference: "primaryPreferred"**:
      // Indica que las operaciones de lectura deben preferir el nodo primario
      // de tu réplica set. Si no está disponible, lee de un secundario.
      readPreference: "primaryPreferred",
      // **maxPoolSize: 10**:
      // Límite máximo de conexiones de socket que el pool mantendrá abierto al servidor MongoDB. Controla la concurrencia y evita sobrecargar la DB.
      maxPoolSize: 10,
      // **serverSelectionTimeoutMS: 5000**:
      // El tiempo (5 segundos) que el driver esperará antes de fallar al intentar encontrar un servidor adecuado (primario o secundario) al cual conectarse.
      serverSelectionTimeoutMS: 5000,
      // **socketTimeoutMS: 45000**:
      // El tiempo (45 segundos) que un socket puede permanecer inactivo
      // antes de que se considere inoperable y se cierre.
      socketTimeoutMS: 45000,
      // **family: 4**:
      // Fuerza el uso de IPv4. (Alternativa: 6 para IPv6, 0 para ambos).
      family: 4,
    });

    logger.info(`MongoDB conectado: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logger.error("Error conectando a MongoDB:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
