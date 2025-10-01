// backend/src/services/DatabaseService.js
const User = require("../models/User");
const GameRound = require("../models/GameRound");
const logger = require("../utils/logger");

class DatabaseService {
  // ===== OPERACIONES DE USUARIO =====

  async findOrCreateUser(socketId, name, initialBalance) {
    let user = await User.findOne({ socketId });

    if (user) {
      user.isActive = true;
      user.lastActivity = new Date();
      await user.save();
    } else {
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
    return await User.findOneAndUpdate(
      { socketId },
      { balance, lastActivity: new Date() },
      { new: true }
    );
  }

  async incrementUserStats(socketId, stats) {
    const updates = { lastActivity: new Date() };

    if (stats.balance !== undefined) {
      updates.balance = stats.balance;
    }

    const increments = {};
    if (stats.totalBets) increments.totalBets = stats.totalBets;
    if (stats.totalWins) increments.totalWins = stats.totalWins;
    if (stats.gamesPlayed) increments.gamesPlayed = stats.gamesPlayed;

    if (Object.keys(increments).length > 0) {
      updates.$inc = increments;
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
        $push: { bets: betData },
        $inc: { totalBetAmount: betData.amount },
      },
      { new: true }
    );
  }

  async updateBetInRound(roundNumber, socketId, betUpdates) {
    const setUpdates = {};
    for (const [key, value] of Object.entries(betUpdates)) {
      setUpdates[`bets.$.${key}`] = value;
    }

    return await GameRound.findOneAndUpdate(
      { roundNumber, "bets.socketId": socketId },
      { $set: setUpdates },
      { new: true }
    );
  }

  async finalizeRound(roundNumber) {
    const round = await GameRound.findOne({ roundNumber });
    if (!round) return null;

    let totalWinAmount = 0;
    round.bets.forEach((bet) => {
      if (bet.cashedOut) {
        totalWinAmount += bet.winAmount;
      }
    });

    round.totalWinAmount = totalWinAmount;
    round.state = "crashed";
    await round.save();

    return round;
  }

  async getNextRoundNumber() {
    try {
      const lastRound = await GameRound.findOne().sort({ roundNumber: -1 });
      return lastRound ? lastRound.roundNumber + 1 : 1;
    } catch (error) {
      logger.error("Error getting next round number:", error);
      return 1;
    }
  }

  async getRecentRounds(limit = 10) {
    return await GameRound.find().sort({ roundNumber: -1 }).limit(limit).lean();
  }
}

module.exports = DatabaseService;
