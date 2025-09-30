const express = require("express");
const app = express();

app.use(express.json());

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("Servidor Aviator en ejecución 🚀");
});

module.exports = app;
