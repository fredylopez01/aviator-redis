const mongoose = require("mongoose");

const betSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  playerName: {
    type: String,
    required: true,
  },
  socketId: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 10,
  },
  cashoutMultiplier: {
    type: Number,
    default: null, // null si no se retiró
  },
  winAmount: {
    type: Number,
    default: 0,
  },
  cashedOut: {
    type: Boolean,
    default: false,
  },
});

const gameRoundSchema = new mongoose.Schema(
  {
    roundNumber: {
      type: Number,
      required: true,
      unique: true,
    },
    crashPoint: {
      type: Number,
      required: true,
    },
    state: {
      type: String,
      enum: ["waiting", "running", "crashed", "finished"],
      default: "waiting",
    },
    bets: {
      type: [betSchema],
      default: [],
    },
    startTime: {
      type: Date,
    },
    crashTime: {
      type: Date,
    },
    maxMultiplier: {
      type: Number,
      default: 1.0,
    },
    totalBetAmount: {
      type: Number,
      default: 0,
    },
    totalWinAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Índices para consultas eficientes
gameRoundSchema.index({ roundNumber: -1 });
gameRoundSchema.index({ state: 1, createdAt: -1 });

module.exports = mongoose.model("GameRound", gameRoundSchema);
