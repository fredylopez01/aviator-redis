const mongoose = require("mongoose");
const logger = require("../utils/logger");

// Define la función asíncrona principal para conectar a la DB.
const connectDB = async () => {
  try {
    // Intenta establecer la conexión a MongoDB.
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // **readPreference: "primaryPreferred"**:
      // Indica que las operaciones de lectura deben preferir el nodo primario
      // de tu réplica set. Si no está disponible, lee de un secundario.
      // Esto es clave en un sistema distribuido con replicación (Replica Set)
      // para asegurar la consistencia y reducir latencia en lecturas comunes.
      readPreference: "primaryPreferred",
      // **maxPoolSize: 10**:
      // Límite máximo de conexiones de socket que el pool mantendrá abierto
      // al servidor MongoDB. Controla la concurrencia y evita sobrecargar la DB.
      maxPoolSize: 10,
      // **serverSelectionTimeoutMS: 5000**:
      // El tiempo (5 segundos) que el driver esperará antes de fallar
      // al intentar encontrar un servidor adecuado (primario o secundario)
      // al cual conectarse. Vital para la robustez en un entorno distribuido.
      serverSelectionTimeoutMS: 5000,
      // **socketTimeoutMS: 45000**:
      // El tiempo (45 segundos) que un socket puede permanecer inactivo
      // antes de que se considere inoperable y se cierre.
      socketTimeoutMS: 45000,
      // **family: 4**:
      // Fuerza el uso de IPv4. (Alternativa: 6 para IPv6, 0 para ambos).
      family: 4,
    });

    // Éxito: Registra en el logger el host al que se conectó.
    logger.info(`MongoDB conectado: ${conn.connection.host}`);
    // Devuelve el objeto de conexión.
    return conn;
  } catch (error) {
    // Error: Registra el fallo de conexión.
    logger.error("Error conectando a MongoDB:", error);
    // **process.exit(1)**:
    // Termina el proceso del backend (aplicación) con un código de error (1).
    // Esto es común para fallos críticos de inicio, ya que el backend no
    // puede operar sin acceso a la base de datos.
    process.exit(1);
  }
};

// Exporta la función para que sea usada en el punto de entrada de la aplicación (ej. server.js o app.js).
module.exports = connectDB;
