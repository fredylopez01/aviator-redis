// backend/src/services/DatabaseService.js
const User = require("../models/User");
const GameRound = require("../models/GameRound");
const logger = require("../utils/logger");

class DatabaseService {
  // ===== OPERACIONES DE USUARIO =====

  async findOrCreateUser(socketId, name, initialBalance) {
    let user = await User.findOne({ socketId });

    if (user) {
      // Si existe, lo reactiva y actualiza la actividad.
      user.isActive = true;
      user.lastActivity = new Date();
      await user.save();
    } else {
      // Si no existe (nuevo usuario), lo crea con el balance inicial.
      user = new User({
        socketId,
        name,
        balance: initialBalance,
      });
      await user.save();
    }

    return user;
  }

  async updateUserBalance(socketId, balance) {
    // **findOneAndUpdate**: Actualiza el balance.
    // **{ new: true }**: Importante; asegura que el método retorne el documento actualizado.
    return await User.findOneAndUpdate(
      { socketId },
      { balance, lastActivity: new Date() },
      { new: true }
    );
  }

  async incrementUserStats(socketId, stats) {
    const updates = { lastActivity: new Date() };
    // Se prepara una operación de incremento ($inc) para actualizar estadísticas de forma atómica.
    const increments = {};
    if (stats.totalBets) increments.totalBets = stats.totalBets;
    if (stats.totalWins) increments.totalWins = stats.totalWins;
    if (stats.gamesPlayed) increments.gamesPlayed = stats.gamesPlayed;

    if (Object.keys(increments).length > 0) {
      // $inc: Operador de MongoDB para incrementar un valor de manera atómica,
      // crucial para la **integridad de datos** en un sistema concurrente (estadísticas).
      updates.$inc = increments;
    }

    // Si se pasa 'balance' como stat, se actualiza directamente, sino, se usa $inc.
    if (stats.balance !== undefined) {
      updates.balance = stats.balance;
    }

    return await User.findOneAndUpdate({ socketId }, updates, { new: true });
  }

  async deactivateUser(socketId) {
    return await User.findOneAndUpdate(
      { socketId },
      { isActive: false, lastActivity: new Date() }
    );
  }

  // ===== OPERACIONES DE RONDA =====

  async createRound(roundData) {
    const round = new GameRound(roundData);
    await round.save();
    return round;
  }

  async updateRoundState(roundNumber, state, additionalData = {}) {
    return await GameRound.findOneAndUpdate(
      { roundNumber },
      { state, ...additionalData },
      { new: true }
    );
  }

  async addBetToRound(roundNumber, betData) {
    return await GameRound.findOneAndUpdate(
      { roundNumber },
      {
        // **$push**: Operador de MongoDB para añadir un elemento a un array (apuesta)
        // de forma concurrente, sin sobrescribir.
        $push: { bets: betData },
        // $inc: Incrementa el monto total apostado atómicamente.
        $inc: { totalBetAmount: betData.amount },
      },
      { new: true }
    );
  }

  async updateBetInRound(roundNumber, socketId, betUpdates) {
    const setUpdates = {};
    for (const [key, value] of Object.entries(betUpdates)) {
      // **'bets.$.key'**: Sintaxis de Mongoose/MongoDB que utiliza el operador posicional ($)
      // para actualizar un campo (`key`) dentro del **primer elemento** del array `bets`
      // que coincide con la condición del query ({ roundNumber, "bets.socketId": socketId }).
      setUpdates[`bets.$.${key}`] = value;
    }

    return await GameRound.findOneAndUpdate(
      // Condición de búsqueda: La ronda Y que dentro de su array 'bets' exista este 'socketId'.
      { roundNumber, "bets.socketId": socketId },
      // $set: Aplica las actualizaciones al elemento encontrado.
      { $set: setUpdates },
      { new: true }
    );
  }

  async finalizeRound(roundNumber) {
    const round = await GameRound.findOne({ roundNumber });
    if (!round) return null;

    // Lógica para calcular y sumar el monto total ganado por los jugadores.
    let totalWinAmount = 0;
    round.bets.forEach((bet) => {
      if (bet.cashedOut) {
        totalWinAmount += bet.winAmount;
      }
    });

    // Actualiza los campos de total de ganancias y el estado final de la ronda.
    round.totalWinAmount = totalWinAmount;
    round.state = "crashed";
    await round.save();

    return round;
  }

  async getNextRoundNumber() {
    try {
      // Busca la última ronda y ordena de forma descendente (-1).
      const lastRound = await GameRound.findOne().sort({ roundNumber: -1 });
      // Si existe una ronda, devuelve el siguiente número; sino, comienza en 1.
      return lastRound ? lastRound.roundNumber + 1 : 1;
    } catch (error) {
      logger.error("Error getting next round number:", error);
      return 1;
    }
  }

  async getRecentRounds(limit = 10) {
    // .lean(): Le dice a Mongoose que devuelva objetos JS planos (POJOs) en lugar de documentos Mongoose,
    // mejorando el rendimiento en operaciones de lectura sin necesidad de modificación.
    return await GameRound.find().sort({ roundNumber: -1 }).limit(limit).lean();
  }
}

module.exports = DatabaseService;
