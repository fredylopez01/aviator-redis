const config = require("../config/gameConfig");
const User = require("../models/User");
const GameRound = require("../models/GameRound");
const logger = require("../utils/logger");
const { getRedisClients } = require("../config/redis");

class GameManager {
  constructor(io) {
    this.io = io;
    this.instanceName = process.env.INSTANCE_NAME || "backend";
    this.isLeader = false;
    this.leaderHeartbeatInterval = null;
    this.roundCheckInterval = null;

    this.setupRedis();
  }

  async setupRedis() {
    try {
      const { client, publisher, subscriber } = getRedisClients();
      this.client = client;
      this.publisher = publisher;
      this.subscriber = subscriber;

      // ===== SUSCRIBIRSE A EVENTOS DE REDIS =====

      // Nueva ronda (periodo de apuestas)
      await this.subscriber.subscribe("game:round:new", (message) => {
        const data = JSON.parse(message);
        logger.info(
          `[${this.instanceName}] 🆕 Nueva ronda #${data.roundNumber}`
        );

        this.io.emit("round:new", {
          roundNumber: data.roundNumber,
          waitTimeMs: data.waitTimeMs,
        });
      });

      // Inicio de ronda (despegar el avión)
      await this.subscriber.subscribe("game:round:start", (message) => {
        const data = JSON.parse(message);
        logger.info(
          `[${this.instanceName}] 🚀 Ronda #${data.roundNumber} iniciada`
        );

        this.io.emit("round:start", {
          roundNumber: data.roundNumber,
          startTime: data.startTime,
        });
      });

      // Crash de ronda
      await this.subscriber.subscribe("game:round:crash", (message) => {
        const data = JSON.parse(message);
        logger.info(`[${this.instanceName}] 💥 Crash en ${data.crashPoint}x`);

        this.io.emit("round:crash", {
          roundNumber: data.roundNumber,
          crashPoint: data.crashPoint,
          crashTime: data.crashTime,
        });
      });

      // Apuesta realizada
      await this.subscriber.subscribe("game:player:bet", (message) => {
        const data = JSON.parse(message);

        this.io.emit("player:bet", {
          socketId: data.socketId,
          playerName: data.playerName,
          amount: data.amount,
          balance: data.balance,
        });
      });

      // Cashout realizado
      await this.subscriber.subscribe("game:player:cashout", (message) => {
        const data = JSON.parse(message);

        // Notificar al jugador específico
        this.io.to(data.socketId).emit("cashout:success", {
          winAmount: data.winAmount,
          multiplier: data.multiplier,
        });

        // Notificar a todos
        this.io.emit("player:cashout", {
          socketId: data.socketId,
          playerName: data.playerName,
          winAmount: data.winAmount,
          multiplier: data.multiplier,
        });
      });

      // Actualización de lista de jugadores
      await this.subscriber.subscribe("game:players:update", (message) => {
        const players = JSON.parse(message);
        this.io.emit("players:update", players);
      });

      // Intentar convertirse en líder
      await this.tryBecomeLeader();

      logger.info(`[${this.instanceName}] ✅ Redis configurado`);
    } catch (error) {
      logger.error(`[${this.instanceName}] ❌ Error en setupRedis:`, error);
    }
  }

  // ===== SISTEMA DE LIDERAZGO =====

  async tryBecomeLeader() {
    try {
      // Intentar tomar el lock de líder (expira en 10 segundos)
      const result = await this.client.set("game:leader", this.instanceName, {
        NX: true,
        EX: 10,
      });

      if (result) {
        this.isLeader = true;
        logger.info(`[${this.instanceName}] 👑 SOY EL LÍDER`);

        // Renovar el lock cada 5 segundos
        this.leaderHeartbeatInterval = setInterval(() => {
          this.renewLeadership();
        }, 5000);

        // Iniciar el verificador de rondas
        this.startRoundChecker();
      } else {
        this.isLeader = false;
        logger.info(`[${this.instanceName}] 📡 Modo seguidor`);

        // Intentar ser líder cada 10 segundos si el actual falla
        setTimeout(() => this.tryBecomeLeader(), 10000);
      }
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en tryBecomeLeader:`, error);
    }
  }

  async renewLeadership() {
    try {
      await this.client.expire("game:leader", 10);
    } catch (error) {
      logger.error(`[${this.instanceName}] Error renovando liderazgo:`, error);
      this.isLeader = false;
      clearInterval(this.leaderHeartbeatInterval);
      clearInterval(this.roundCheckInterval);
      this.tryBecomeLeader();
    }
  }

  // ===== LÓGICA DEL LÍDER: CONTROL DE RONDAS =====

  startRoundChecker() {
    if (!this.isLeader) return;

    // Verificar cada 500ms si hay que iniciar/crashear una ronda
    this.roundCheckInterval = setInterval(() => {
      this.checkRoundStatus();
    }, 500);

    // Iniciar primera ronda si no hay ninguna
    this.checkRoundStatus();
  }

  async checkRoundStatus() {
    if (!this.isLeader) return;

    try {
      const roundData = await this.client.get("game:round:current");

      if (!roundData) {
        // No hay ronda activa, crear una nueva
        const playerCount = await this.getPlayerCount();
        if (playerCount > 0) {
          await this.createNewRound();
        }
        return;
      }

      const round = JSON.parse(roundData);
      const now = Date.now();

      if (round.state === "waiting" && now >= round.startTime) {
        // Es hora de iniciar la ronda
        await this.startRound(round);
      } else if (round.state === "running" && now >= round.crashTime) {
        // Es hora de crashear
        await this.crashRound(round);
      }
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en checkRoundStatus:`, error);
    }
  }

  async createNewRound() {
    try {
      const roundNumber = await this.getNextRoundNumber();
      const crashPoint = this.generateCrashPoint();

      const now = Date.now();
      const waitTimeMs = 5000; // 5 segundos para apostar
      const startTime = now + waitTimeMs;

      // Calcular duración de la ronda basado en el crash point
      // crashPoint = 1.0 + (ticks * 0.01)
      // ticks = (crashPoint - 1.0) / 0.01
      const ticks = (crashPoint - 1.0) / config.tickIncrement;
      const durationMs = ticks * config.tickInterval;
      const crashTime = startTime + durationMs;

      const round = {
        roundNumber,
        crashPoint,
        state: "waiting",
        createdAt: now,
        startTime,
        crashTime,
      };

      // Guardar en Redis
      await this.client.set("game:round:current", JSON.stringify(round), {
        EX: 300, // 5 minutos
      });

      // Crear documento en MongoDB
      const roundDoc = new GameRound({
        roundNumber,
        crashPoint,
        state: "waiting",
        startTime: new Date(startTime),
        crashTime: new Date(crashTime),
      });
      await roundDoc.save();

      // Resetear apuestas de todos los jugadores
      await this.resetAllPlayerBets();

      // Notificar a todos los backends
      await this.publisher.publish(
        "game:round:new",
        JSON.stringify({
          roundNumber,
          waitTimeMs,
        })
      );

      await this.publishPlayersUpdate();

      logger.info(
        `[${
          this.instanceName
        }] 🎲 Ronda #${roundNumber} creada - Crash: ${crashPoint}x en ${(
          durationMs / 1000
        ).toFixed(1)}s`
      );
    } catch (error) {
      logger.error(`[${this.instanceName}] Error creando ronda:`, error);
    }
  }

  async startRound(round) {
    try {
      round.state = "running";
      await this.client.set("game:round:current", JSON.stringify(round), {
        EX: 300,
      });

      // Actualizar MongoDB
      await GameRound.findOneAndUpdate(
        { roundNumber: round.roundNumber },
        { state: "running", actualStartTime: new Date() }
      );

      // Notificar inicio
      await this.publisher.publish(
        "game:round:start",
        JSON.stringify({
          roundNumber: round.roundNumber,
          startTime: round.startTime,
        })
      );

      logger.info(
        `[${this.instanceName}] ▶️ Ronda #${round.roundNumber} iniciada`
      );
    } catch (error) {
      logger.error(`[${this.instanceName}] Error iniciando ronda:`, error);
    }
  }

  async crashRound(round) {
    try {
      round.state = "crashed";
      await this.client.set("game:round:current", JSON.stringify(round), {
        EX: 60, // 1 minuto
      });

      // Actualizar MongoDB
      const roundDoc = await GameRound.findOneAndUpdate(
        { roundNumber: round.roundNumber },
        {
          state: "crashed",
          maxMultiplier: round.crashPoint,
        },
        { new: true }
      );

      // Calcular ganancias totales
      if (roundDoc) {
        let totalWinAmount = 0;
        roundDoc.bets.forEach((bet) => {
          if (bet.cashedOut) {
            totalWinAmount += bet.winAmount;
          }
        });
        roundDoc.totalWinAmount = totalWinAmount;
        await roundDoc.save();
      }

      // Notificar crash
      await this.publisher.publish(
        "game:round:crash",
        JSON.stringify({
          roundNumber: round.roundNumber,
          crashPoint: round.crashPoint,
          crashTime: round.crashTime,
        })
      );

      logger.info(
        `[${this.instanceName}] 💥 Ronda #${round.roundNumber} crashed en ${round.crashPoint}x`
      );

      // Esperar 3 segundos y crear nueva ronda
      setTimeout(() => {
        if (this.isLeader) {
          this.client.del("game:round:current");
        }
      }, 3000);
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en crash:`, error);
    }
  }

  // ===== ACCIONES DE JUGADORES =====

  async addPlayer(socketId, name) {
    try {
      let user = await User.findOne({ socketId });

      if (user) {
        user.isActive = true;
        user.lastActivity = new Date();
        await user.save();
      } else {
        user = new User({
          socketId,
          name,
          balance: config.initialBalance,
        });
        await user.save();
      }

      // Guardar en Redis
      await this.client.hSet(`player:${socketId}`, {
        id: socketId,
        name: user.name,
        balance: user.balance.toString(),
        bet: "0",
        cashedOut: "false",
        win: "0",
      });
      await this.client.expire(`player:${socketId}`, 3600);

      await this.publishPlayersUpdate();

      logger.info(`[${this.instanceName}] ➕ Jugador añadido: ${name}`);

      return user;
    } catch (error) {
      logger.error(`[${this.instanceName}] Error añadiendo jugador:`, error);
      throw error;
    }
  }

  async removePlayer(socketId) {
    try {
      await User.findOneAndUpdate(
        { socketId },
        { isActive: false, lastActivity: new Date() }
      );

      await this.client.del(`player:${socketId}`);
      await this.publishPlayersUpdate();

      logger.info(`[${this.instanceName}] ➖ Jugador eliminado: ${socketId}`);
    } catch (error) {
      logger.error(`[${this.instanceName}] Error eliminando jugador:`, error);
    }
  }

  async placeBet(socketId, amount) {
    try {
      // Verificar que la ronda esté en estado "waiting"
      const roundData = await this.client.get("game:round:current");
      if (!roundData) return { success: false, error: "No hay ronda activa" };

      const round = JSON.parse(roundData);
      if (round.state !== "waiting") {
        return { success: false, error: "No puedes apostar ahora" };
      }

      // Obtener jugador de Redis
      const playerData = await this.client.hGetAll(`player:${socketId}`);
      if (!playerData || !playerData.id) {
        return { success: false, error: "Jugador no encontrado" };
      }

      const balance = parseFloat(playerData.balance) || 0;
      const currentBet = parseFloat(playerData.bet) || 0;

      if (currentBet > 0) {
        return { success: false, error: "Ya tienes una apuesta activa" };
      }

      if (amount < config.minBet || amount > config.maxBet) {
        return { success: false, error: "Monto inválido" };
      }

      if (amount > balance) {
        return { success: false, error: "Saldo insuficiente" };
      }

      // Actualizar balance y apuesta
      const newBalance = balance - amount;
      await this.client.hSet(`player:${socketId}`, {
        balance: newBalance.toString(),
        bet: amount.toString(),
      });

      // Actualizar MongoDB
      const user = await User.findOneAndUpdate(
        { socketId },
        {
          balance: newBalance,
          $inc: { totalBets: amount },
          lastActivity: new Date(),
        },
        { new: true }
      );

      // Agregar apuesta al documento de ronda
      if (this.isLeader) {
        await GameRound.findOneAndUpdate(
          { roundNumber: round.roundNumber },
          {
            $push: {
              bets: {
                userId: user._id,
                playerName: playerData.name,
                socketId,
                amount,
                cashedOut: false,
              },
            },
            $inc: { totalBetAmount: amount },
          }
        );
      }

      // Publicar evento de apuesta
      await this.publisher.publish(
        "game:player:bet",
        JSON.stringify({
          socketId,
          playerName: playerData.name,
          amount,
          balance: newBalance,
        })
      );

      logger.info(
        `[${this.instanceName}] 🎯 Apuesta: ${playerData.name} - $${amount}`
      );

      return { success: true, balance: newBalance };
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en placeBet:`, error);
      return { success: false, error: "Error interno" };
    }
  }

  async cashout(socketId) {
    try {
      // Verificar que la ronda esté "running"
      const roundData = await this.client.get("game:round:current");
      if (!roundData) {
        return { success: false, error: "No hay ronda activa" };
      }

      const round = JSON.parse(roundData);
      if (round.state !== "running") {
        return { success: false, error: "No hay ronda en progreso" };
      }

      // Obtener datos del jugador
      const playerData = await this.client.hGetAll(`player:${socketId}`);
      if (!playerData || !playerData.id) {
        return { success: false, error: "Jugador no encontrado" };
      }

      const bet = parseFloat(playerData.bet) || 0;
      const cashedOut = playerData.cashedOut === "true";

      if (bet <= 0) {
        return { success: false, error: "No tienes apuesta activa" };
      }

      if (cashedOut) {
        return { success: false, error: "Ya te retiraste" };
      }

      // Calcular multiplicador actual
      const multiplier = this.calculateMultiplier(round.startTime);

      // Verificar que no haya pasado el crash point
      if (multiplier >= round.crashPoint) {
        return { success: false, error: "Demasiado tarde, ya crasheó" };
      }

      const winAmount = bet * multiplier;
      const balance = parseFloat(playerData.balance) || 0;
      const newBalance = balance + winAmount;

      // Actualizar Redis
      await this.client.hSet(`player:${socketId}`, {
        balance: newBalance.toString(),
        cashedOut: "true",
        win: winAmount.toString(),
      });

      // Actualizar MongoDB
      const user = await User.findOneAndUpdate(
        { socketId },
        {
          balance: newBalance,
          $inc: { totalWins: winAmount },
          lastActivity: new Date(),
        },
        { new: true }
      );

      // Actualizar apuesta en ronda
      if (this.isLeader) {
        await GameRound.findOneAndUpdate(
          {
            roundNumber: round.roundNumber,
            "bets.socketId": socketId,
          },
          {
            $set: {
              "bets.$.cashedOut": true,
              "bets.$.cashoutMultiplier": multiplier,
              "bets.$.winAmount": winAmount,
            },
          }
        );
      }

      // Publicar evento de cashout
      await this.publisher.publish(
        "game:player:cashout",
        JSON.stringify({
          socketId,
          playerName: playerData.name,
          winAmount,
          multiplier,
          balance: newBalance,
        })
      );

      logger.info(
        `[${this.instanceName}] 💰 Cashout: ${
          playerData.name
        } - $${winAmount.toFixed(2)} (${multiplier.toFixed(2)}x)`
      );

      return { success: true, winAmount, multiplier };
    } catch (error) {
      logger.error(`[${this.instanceName}] Error en cashout:`, error);
      return { success: false, error: "Error interno" };
    }
  }

  // ===== UTILIDADES =====

  calculateMultiplier(startTime) {
    const elapsed = Date.now() - startTime;
    if (elapsed < 0) return 1.0;

    const ticks = Math.floor(elapsed / config.tickInterval);
    return parseFloat((1.0 + ticks * config.tickIncrement).toFixed(2));
  }

  generateCrashPoint() {
    const random = Math.random();
    return Math.max(
      1.01,
      Math.floor((99 / (100 * random - random)) * 100) / 100
    );
  }

  async resetAllPlayerBets() {
    const playerKeys = await this.client.keys("player:*");
    for (const key of playerKeys) {
      await this.client.hSet(key, {
        bet: "0",
        cashedOut: "false",
        win: "0",
      });
    }
  }

  async publishPlayersUpdate() {
    try {
      const playerKeys = await this.client.keys("player:*");
      const players = [];

      for (const key of playerKeys) {
        const data = await this.client.hGetAll(key);
        if (data && data.id) {
          players.push({
            id: data.id,
            name: data.name,
            balance: parseFloat(data.balance) || 0,
            bet: parseFloat(data.bet) || 0,
            cashedOut: data.cashedOut === "true",
            win: parseFloat(data.win) || 0,
          });
        }
      }

      await this.publisher.publish(
        "game:players:update",
        JSON.stringify(players)
      );
    } catch (error) {
      logger.error(`[${this.instanceName}] Error publicando jugadores:`, error);
    }
  }

  async getPlayerCount() {
    const keys = await this.client.keys("player:*");
    return keys.length;
  }

  async getNextRoundNumber() {
    try {
      const lastRound = await GameRound.findOne().sort({ roundNumber: -1 });
      return lastRound ? lastRound.roundNumber + 1 : 1;
    } catch (error) {
      return 1;
    }
  }

  async getGameState(socketId) {
    const playerKeys = await this.client.keys("player:*");
    const players = [];

    for (const key of playerKeys) {
      const data = await this.client.hGetAll(key);
      if (data && data.id) {
        players.push({
          id: data.id,
          name: data.name,
          balance: parseFloat(data.balance) || 0,
          bet: parseFloat(data.bet) || 0,
          cashedOut: data.cashedOut === "true",
          win: parseFloat(data.win) || 0,
        });
      }
    }

    // Obtener ronda actual
    let roundInfo = { state: "waiting", multiplier: 1.0 };

    const roundData = await this.client.get("game:round:current");
    if (roundData) {
      const round = JSON.parse(roundData);
      roundInfo = {
        roundNumber: round.roundNumber,
        state: round.state,
        startTime: round.startTime,
      };

      if (round.state === "running") {
        roundInfo.multiplier = this.calculateMultiplier(round.startTime);
      }
    }

    return { round: roundInfo, players };
  }

  stopGame() {
    logger.info(`[${this.instanceName}] 🛑 Deteniendo GameManager`);

    if (this.leaderHeartbeatInterval) {
      clearInterval(this.leaderHeartbeatInterval);
    }

    if (this.roundCheckInterval) {
      clearInterval(this.roundCheckInterval);
    }

    this.isLeader = false;
  }
}

module.exports = GameManager;
