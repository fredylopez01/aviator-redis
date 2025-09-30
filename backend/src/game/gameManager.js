const config = require("../config/gameConfig");
const Player = require("./player");
const Round = require("./round");
const User = require("../models/User");
const GameRound = require("../models/GameRound");
const logger = require("../utils/logger");
const { getRedisClients } = require("../config/redis");

class GameManager {
  constructor(io) {
    this.io = io;
    this.players = {};
    this.currentRound = null;
    this.currentRoundDoc = null;
    this.gameRunning = false;
    this.crashCheckInterval = null;
    this.instanceName = process.env.INSTANCE_NAME || "backend";
    this.isLeader = false;
    this.setupRedis();
  }

  async setupRedis() {
    try {
      const { client, publisher, subscriber } = getRedisClients();
      this.client = client;
      this.publisher = publisher;
      this.subscriber = subscriber;

      // ===== EVENTO: Inicio de ronda con timestamp =====
      await this.subscriber.subscribe("game:round:start", async (message) => {
        const data = JSON.parse(message);
        this.currentRound = {
          roundNumber: data.roundNumber,
          startTime: data.startTime,
          crashPoint: data.crashPoint, // Solo backends lo conocen
          state: "running",
        };

        // Guardar en Redis para que otros backends puedan recuperar
        await this.client.set(
          "game:current_round",
          JSON.stringify(this.currentRound),
          { EX: 300 } // 5 minutos
        );

        Object.values(this.players).forEach((p) => p.resetForNextRound());

        // NO enviar crashPoint al frontend
        this.io.emit("round:start", {
          roundNumber: data.roundNumber,
          startTime: data.startTime,
          // crashPoint NO se envía
        });

        // Todos los backends verifican crash como fallback
        this.startCrashCheck();

        logger.info(
          `[${this.instanceName}] Ronda ${data.roundNumber} iniciada - Crash en ${data.crashPoint}x`
        );
      });

      // ===== EVENTO: Crash de ronda =====
      await this.subscriber.subscribe("game:round:crash", async (message) => {
        const data = JSON.parse(message);

        if (this.currentRound) {
          this.currentRound.state = "crashed";
        }

        if (this.crashCheckInterval) {
          clearInterval(this.crashCheckInterval);
          this.crashCheckInterval = null;
        }

        // Limpiar ronda de Redis
        await this.client.del("game:current_round");

        this.io.emit("round:crash", {
          roundNumber: data.roundNumber,
          crashPoint: data.crashPoint,
        });

        logger.info(
          `[${this.instanceName}] Ronda ${data.roundNumber} crashed en ${data.crashPoint}x`
        );
      });

      // ===== EVENTO: Nueva ronda (período de espera) =====
      await this.subscriber.subscribe("game:round:new", async (message) => {
        const data = JSON.parse(message);
        this.currentRound = {
          roundNumber: data.roundNumber,
          state: "waiting",
          crashPoint: data.crashPoint,
        };

        this.io.emit("round:new", {
          roundNumber: data.roundNumber,
          waitTime: data.waitTime,
        });

        logger.info(
          `[${this.instanceName}] Nueva ronda ${data.roundNumber} - Esperando ${data.waitTime}ms`
        );
      });

      // ===== EVENTO: Apuesta colocada =====
      await this.subscriber.subscribe("game:bet:placed", async (message) => {
        const data = JSON.parse(message);

        if (this.players[data.socketId]) {
          this.players[data.socketId].bet = data.amount;
          this.players[data.socketId].balance = data.balance;
        }

        if (this.isLeader && this.currentRoundDoc) {
          const exists = this.currentRoundDoc.bets.find(
            (b) => b.socketId === data.socketId
          );

          if (!exists) {
            this.currentRoundDoc.bets.push({
              userId: data.userId || null,
              playerName: data.playerName,
              socketId: data.socketId,
              amount: data.amount,
              cashedOut: false,
            });
            this.currentRoundDoc.totalBetAmount += data.amount;
            await this.currentRoundDoc.save();
          }
        }

        this.io.emit("player:bet", {
          socketId: data.socketId,
          playerName: data.playerName,
          amount: data.amount,
          balance: data.balance,
        });
      });

      // ===== EVENTO: Cashout ejecutado =====
      await this.subscriber.subscribe(
        "game:cashout:executed",
        async (message) => {
          const data = JSON.parse(message);

          if (this.players[data.socketId]) {
            this.players[data.socketId].cashedOut = true;
            this.players[data.socketId].win = data.winAmount;
            this.players[data.socketId].balance = data.balance;
          }

          if (this.isLeader && this.currentRoundDoc) {
            const betIndex = this.currentRoundDoc.bets.findIndex(
              (bet) => bet.socketId === data.socketId
            );

            if (betIndex !== -1) {
              this.currentRoundDoc.bets[betIndex].cashedOut = true;
              this.currentRoundDoc.bets[betIndex].winAmount = data.winAmount;
              this.currentRoundDoc.bets[betIndex].cashoutMultiplier =
                data.multiplier;
              await this.currentRoundDoc.save();
            }
          }

          this.io.to(data.socketId).emit("cashout:success", {
            winAmount: data.winAmount,
            multiplier: data.multiplier,
          });

          this.io.emit("player:cashout", {
            socketId: data.socketId,
            playerName: data.playerName,
            winAmount: data.winAmount,
            multiplier: data.multiplier,
          });
        }
      );

      // ===== EVENTO: Actualización de jugadores =====
      await this.subscriber.subscribe(
        "game:players:update",
        async (message) => {
          const players = JSON.parse(message);
          this.io.emit("players:update", players);
        }
      );

      await this.tryBecomeLeader();
      logger.info(`[${this.instanceName}] Redis configurado correctamente`);
    } catch (error) {
      logger.error("Error configurando Redis:", error);
    }
  }

  async tryBecomeLeader() {
    try {
      const result = await this.client.set("game:leader", this.instanceName, {
        NX: true,
        EX: 10,
      });

      if (result) {
        this.isLeader = true;
        logger.info(`[${this.instanceName}] 👑 LÍDER ELEGIDO`);

        this.leaderInterval = setInterval(async () => {
          try {
            await this.client.expire("game:leader", 10);
          } catch (error) {
            logger.error("Error renovando liderazgo:", error);
          }
        }, 5000);

        const playerCount = await this.getTotalPlayersCount();
        if (playerCount > 0 && !this.gameRunning) {
          this.startNewRound();
        }
      } else {
        this.isLeader = false;
        logger.info(`[${this.instanceName}] 📡 Seguidor activo`);
      }
    } catch (error) {
      logger.error("Error en tryBecomeLeader:", error);
    }
  }

  async startNewRound() {
    if (!this.isLeader) return;

    try {
      this.gameRunning = true;

      const crashPoint = this.generateCrashPoint();
      const roundNumber = await this.getNextRoundNumber();

      const playerKeys = await this.client.keys("player:*");
      for (const key of playerKeys) {
        await this.client.hSet(key, {
          bet: "0",
          cashedOut: "false",
          win: "0",
        });
      }

      this.currentRoundDoc = new GameRound({
        roundNumber: roundNumber,
        crashPoint: crashPoint,
        state: "waiting",
        startTime: new Date(),
      });
      await this.currentRoundDoc.save();

      await this.publisher.publish(
        "game:round:new",
        JSON.stringify({
          roundNumber: roundNumber,
          crashPoint: crashPoint,
          waitTime: config.waitTime,
        })
      );

      await this.publishPlayersUpdate();

      setTimeout(() => {
        if (this.isLeader && this.gameRunning) {
          this.startRoundExecution(roundNumber, crashPoint);
        }
      }, config.waitTime);
    } catch (error) {
      logger.error("Error iniciando nueva ronda:", error);
    }
  }

  async startRoundExecution(roundNumber, crashPoint) {
    if (!this.isLeader) return;

    try {
      const startTime = Date.now();

      if (this.currentRoundDoc) {
        this.currentRoundDoc.state = "running";
        this.currentRoundDoc.actualStartTime = new Date(startTime);
        await this.currentRoundDoc.save();
      }

      await this.publisher.publish(
        "game:round:start",
        JSON.stringify({
          roundNumber: roundNumber,
          startTime: startTime,
          crashPoint: crashPoint,
        })
      );
    } catch (error) {
      logger.error("Error ejecutando ronda:", error);
    }
  }

  // Todos los backends verifican crash como fallback
  startCrashCheck() {
    if (!this.currentRound) return;

    if (this.crashCheckInterval) {
      clearInterval(this.crashCheckInterval);
    }

    this.crashCheckInterval = setInterval(async () => {
      if (!this.currentRound || this.currentRound.state !== "running") {
        clearInterval(this.crashCheckInterval);
        this.crashCheckInterval = null;
        return;
      }

      const currentMultiplier = this.calculateCurrentMultiplier();

      if (currentMultiplier >= this.currentRound.crashPoint) {
        // Si soy líder, ejecuto el crash
        if (this.isLeader) {
          await this.executeCrash();
        } else {
          // Si NO soy líder, intento convertirme en líder de emergencia
          const leader = await this.client.get("game:leader");
          if (!leader) {
            logger.warn(`[${this.instanceName}] Líder caído, tomando control`);
            await this.tryBecomeLeader();
            if (this.isLeader) {
              await this.executeCrash();
            }
          }
        }
      }
    }, 100);
  }

  calculateCurrentMultiplier() {
    if (!this.currentRound || !this.currentRound.startTime) return 1.0;

    const elapsed = Date.now() - this.currentRound.startTime;
    if (elapsed < 0) return 1.0;

    const ticks = Math.floor(elapsed / config.tickInterval);
    return parseFloat((1.0 + ticks * config.tickIncrement).toFixed(2));
  }

  async executeCrash() {
    if (!this.currentRound) return;

    try {
      clearInterval(this.crashCheckInterval);
      this.crashCheckInterval = null;

      this.currentRound.state = "crashed";

      if (this.currentRoundDoc) {
        this.currentRoundDoc.state = "crashed";
        this.currentRoundDoc.crashTime = new Date();
        this.currentRoundDoc.maxMultiplier = this.currentRound.crashPoint;

        let totalWinAmount = 0;
        this.currentRoundDoc.bets.forEach((bet) => {
          if (bet.cashedOut) {
            totalWinAmount += bet.winAmount;
          }
        });
        this.currentRoundDoc.totalWinAmount = totalWinAmount;
        await this.currentRoundDoc.save();
      }

      await this.publisher.publish(
        "game:round:crash",
        JSON.stringify({
          roundNumber: this.currentRound.roundNumber,
          crashPoint: this.currentRound.crashPoint,
        })
      );

      await this.publishPlayersUpdate();

      setTimeout(async () => {
        const playerCount = await this.getTotalPlayersCount();
        if (this.isLeader && this.gameRunning && playerCount > 0) {
          this.startNewRound();
        }
      }, 3000);
    } catch (error) {
      logger.error("Error ejecutando crash:", error);
    }
  }

  async addPlayer(id, name) {
    try {
      let user = await User.findOne({ socketId: id });

      if (user) {
        user.isActive = true;
        user.lastActivity = new Date();
        await user.save();
      } else {
        user = new User({
          socketId: id,
          name: name,
          balance: config.initialBalance,
        });
        await user.save();
      }

      this.players[id] = new Player(id, user.name, user.balance);

      await this.client.hSet(`player:${id}`, {
        id: id,
        name: user.name,
        balance: user.balance.toString(),
        bet: "0",
        cashedOut: "false",
        win: "0",
      });
      await this.client.expire(`player:${id}`, 3600);

      await this.publishPlayersUpdate();

      if (this.isLeader && !this.gameRunning) {
        this.startNewRound();
      }

      return user;
    } catch (error) {
      logger.error("Error agregando jugador:", error);
      throw error;
    }
  }

  async removePlayer(id) {
    try {
      await User.findOneAndUpdate(
        { socketId: id },
        { isActive: false, lastActivity: new Date() }
      );

      delete this.players[id];
      await this.client.del(`player:${id}`);
      await this.publishPlayersUpdate();

      logger.info(`[${this.instanceName}] Usuario desconectado: ${id}`);
    } catch (error) {
      logger.error("Error removiendo jugador:", error);
    }
  }

  async placeBet(id, amount) {
    if (!this.currentRound || this.currentRound.state !== "waiting") {
      return false;
    }

    try {
      const player = this.players[id];
      if (!player || amount < config.minBet || amount > config.maxBet) {
        return false;
      }

      if (player.placeBet(amount)) {
        const user = await User.findOneAndUpdate(
          { socketId: id },
          {
            balance: player.balance,
            $inc: { totalBets: amount },
            lastActivity: new Date(),
          },
          { new: true }
        );

        await this.client.hSet(`player:${id}`, {
          balance: player.balance.toString(),
          bet: amount.toString(),
        });

        await this.publisher.publish(
          "game:bet:placed",
          JSON.stringify({
            socketId: id,
            userId: user._id.toString(),
            playerName: player.name,
            amount: amount,
            balance: player.balance,
          })
        );

        logger.info(
          `[${this.instanceName}] Apuesta: ${player.name} - $${amount}`
        );
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Error procesando apuesta:", error);
      return false;
    }
  }

  async cashout(id) {
    if (!this.currentRound || this.currentRound.state !== "running") {
      return { success: false, error: "No hay ronda en progreso" };
    }

    const player = this.players[id];
    if (!player) {
      return { success: false, error: "Jugador no encontrado" };
    }

    try {
      const redisPlayerData = await this.client.hGetAll(`player:${id}`);

      if (redisPlayerData.cashedOut === "true") {
        return { success: false, error: "Ya te retiraste" };
      }

      const currentBet = parseFloat(redisPlayerData.bet) || 0;
      if (currentBet <= 0) {
        return { success: false, error: "No tienes apuesta activa" };
      }

      const currentMultiplier = this.calculateCurrentMultiplier();
      const winAmount = currentBet * currentMultiplier;

      player.balance += winAmount;
      player.cashedOut = true;
      player.win = winAmount;

      const user = await User.findOneAndUpdate(
        { socketId: id },
        {
          balance: player.balance,
          $inc: { totalWins: winAmount },
          lastActivity: new Date(),
        },
        { new: true }
      );

      await this.client.hSet(`player:${id}`, {
        balance: player.balance.toString(),
        cashedOut: "true",
        win: winAmount.toString(),
      });

      await this.publisher.publish(
        "game:cashout:executed",
        JSON.stringify({
          socketId: id,
          userId: user._id.toString(),
          playerName: player.name,
          winAmount: winAmount,
          multiplier: currentMultiplier,
          balance: player.balance,
        })
      );

      logger.info(
        `[${this.instanceName}] Cashout: ${player.name} - $${winAmount.toFixed(
          2
        )} (${currentMultiplier}x)`
      );
      return { success: true, winAmount, multiplier: currentMultiplier };
    } catch (error) {
      logger.error("Error en cashout:", error);
      return { success: false, error: "Error interno" };
    }
  }

  generateCrashPoint() {
    const random = Math.random();
    return Math.max(
      1.01,
      Math.floor((99 / (100 * random - random)) * 100) / 100
    );
  }

  async publishPlayersUpdate() {
    try {
      const playerKeys = await this.client.keys("player:*");
      const playersArray = [];

      for (const key of playerKeys) {
        const playerData = await this.client.hGetAll(key);
        if (playerData && playerData.id) {
          playersArray.push({
            id: playerData.id,
            name: playerData.name,
            balance: parseFloat(playerData.balance) || 0,
            bet: parseFloat(playerData.bet) || 0,
            cashedOut: playerData.cashedOut === "true",
            win: parseFloat(playerData.win) || 0,
          });
        }
      }

      await this.publisher.publish(
        "game:players:update",
        JSON.stringify(playersArray)
      );
    } catch (error) {
      logger.error("Error publicando jugadores:", error);
    }
  }

  async getNextRoundNumber() {
    try {
      const lastRound = await GameRound.findOne().sort({ roundNumber: -1 });
      return lastRound ? lastRound.roundNumber + 1 : 1;
    } catch (error) {
      logger.error("Error obteniendo número de ronda:", error);
      return 1;
    }
  }

  async getGameState() {
    const playerKeys = await this.client.keys("player:*");
    const playersArray = [];

    for (const key of playerKeys) {
      const playerData = await this.client.hGetAll(key);
      if (playerData && playerData.id) {
        playersArray.push({
          id: playerData.id,
          name: playerData.name,
          balance: parseFloat(playerData.balance) || 0,
          bet: parseFloat(playerData.bet) || 0,
          cashedOut: playerData.cashedOut === "true",
          win: parseFloat(playerData.win) || 0,
        });
      }
    }

    // Recuperar ronda actual de Redis si existe
    let roundInfo = { state: "waiting", multiplier: 1.0 };

    try {
      const roundData = await this.client.get("game:current_round");
      if (roundData) {
        const round = JSON.parse(roundData);
        // Calcular multiplicador actual basado en timestamp
        const currentMultiplier =
          this.calculateCurrentMultiplierFromRound(round);
        roundInfo = {
          roundNumber: round.roundNumber,
          state: round.state,
          multiplier: currentMultiplier,
          startTime: round.startTime,
          // NO enviar crashPoint
        };
      }
    } catch (error) {
      logger.error("Error obteniendo estado de ronda:", error);
    }

    return {
      round: roundInfo,
      players: playersArray,
    };
  }

  calculateCurrentMultiplierFromRound(round) {
    if (!round || !round.startTime) return 1.0;

    const elapsed = Date.now() - round.startTime;
    if (elapsed < 0) return 1.0;

    const ticks = Math.floor(elapsed / config.tickInterval);
    return parseFloat((1.0 + ticks * config.tickIncrement).toFixed(2));
  }

  async getTotalPlayersCount() {
    try {
      const playerKeys = await this.client.keys("player:*");
      return playerKeys.length;
    } catch (error) {
      return 0;
    }
  }

  stopGame() {
    logger.info(`[${this.instanceName}] Deteniendo GameManager...`);
    this.gameRunning = false;

    if (this.crashCheckInterval) {
      clearInterval(this.crashCheckInterval);
      this.crashCheckInterval = null;
    }

    if (this.leaderInterval) {
      clearInterval(this.leaderInterval);
      this.leaderInterval = null;
    }
  }
}

module.exports = GameManager;
