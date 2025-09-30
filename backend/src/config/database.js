const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      readPreference: "primaryPreferred",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
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
