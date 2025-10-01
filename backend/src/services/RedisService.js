// backend/src/services/RedisService.js
const { getRedisClients } = require("../config/redis");
const logger = require("../utils/logger");

class RedisService {
  constructor() {
    const { client, publisher, subscriber } = getRedisClients();
    this.client = client;
    this.publisher = publisher;
    this.subscriber = subscriber;
  }

  // ===== OPERACIONES DE RONDA =====

  async saveCurrentRound(round) {
    await this.client.set("game:round:current", JSON.stringify(round), {
      EX: 300, // 5 minutos
    });
  }

  async getCurrentRound() {
    const data = await this.client.get("game:round:current");
    return data ? JSON.parse(data) : null;
  }

  async deleteCurrentRound() {
    await this.client.del("game:round:current");
  }

  // ===== OPERACIONES DE JUGADOR =====

  async savePlayer(socketId, playerData) {
    await this.client.hSet(`player:${socketId}`, {
      id: socketId,
      name: playerData.name,
      balance: playerData.balance.toString(),
      bet: (playerData.bet || 0).toString(),
      cashedOut: (playerData.cashedOut || false).toString(),
      win: (playerData.win || 0).toString(),
    });
    await this.client.expire(`player:${socketId}`, 3600);
  }

  async getPlayer(socketId) {
    const data = await this.client.hGetAll(`player:${socketId}`);
    if (!data || !data.id) return null;

    return {
      id: data.id,
      name: data.name,
      balance: parseFloat(data.balance) || 0,
      bet: parseFloat(data.bet) || 0,
      cashedOut: data.cashedOut === "true",
      win: parseFloat(data.win) || 0,
    };
  }

  async updatePlayer(socketId, updates) {
    const stringUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      stringUpdates[key] = value.toString();
    }
    await this.client.hSet(`player:${socketId}`, stringUpdates);
  }

  async deletePlayer(socketId) {
    await this.client.del(`player:${socketId}`);
  }

  async getAllPlayers() {
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

    return players;
  }

  async getPlayerCount() {
    const keys = await this.client.keys("player:*");
    return keys.length;
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

  // ===== OPERACIONES DE LIDERAZGO =====

  async tryAcquireLeadership(instanceName, ttlSeconds = 10) {
    const result = await this.client.set("game:leader", instanceName, {
      NX: true,
      EX: ttlSeconds,
    });
    return result !== null;
  }

  async renewLeadership(ttlSeconds = 10) {
    await this.client.expire("game:leader", ttlSeconds);
  }

  async getLeader() {
    return await this.client.get("game:leader");
  }

  // ===== PUB/SUB =====

  async publish(channel, message) {
    const data =
      typeof message === "string" ? message : JSON.stringify(message);
    await this.publisher.publish(channel, data);
  }

  async subscribe(channel, callback) {
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const data = JSON.parse(message);
        callback(data);
      } catch (error) {
        logger.error(`Error parsing message from ${channel}:`, error);
        callback(message);
      }
    });
  }
}

module.exports = RedisService;
