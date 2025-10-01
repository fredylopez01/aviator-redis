// backend/src/services/RedisService.js
const { getRedisClients } = require("../config/redis");
const logger = require("../utils/logger");

class RedisService {
  constructor() {
    // Obtiene los clientes (caching, publisher, subscriber) ya inicializados.
    const { client, publisher, subscriber } = getRedisClients();
    this.client = client;
    this.publisher = publisher;
    this.subscriber = subscriber;
  }

  // ===== OPERACIONES DE RONDA (Uso de llave SET/GET) =====

  async saveCurrentRound(round) {
    // Almacena el objeto de la ronda actual como una cadena JSON.
    await this.client.set("game:round:current", JSON.stringify(round), {
      // **EX: 120**: Establece un tiempo de expiración de 120 segundos (2 minutos).
      // Esto es crucial para la robustez: si el backend cae, la ronda caducará automáticamente.
      EX: 120,
    });
  }

  async getCurrentRound() {
    // Recupera la ronda y la convierte de JSON a objeto JS.
    const data = await this.client.get("game:round:current");
    return data ? JSON.parse(data) : null;
  }

  async deleteCurrentRound() {
    await this.client.del("game:round:current");
  }

  // ===== OPERACIONES DE JUGADOR (Uso de Hash - hSet/hGetAll) =====

  async savePlayer(socketId, playerData) {
    // **hSet(`player:${socketId}`, ...)**: Usa un tipo HASH para almacenar múltiples campos
    // (id, name, balance, etc.) bajo una sola llave (`player:socketid_X`).
    // Se convierten todos los valores a string, ya que Redis solo almacena strings.
    await this.client.hSet(`player:${socketId}`, {
      id: socketId,
      name: playerData.name,
      balance: playerData.balance.toString(),
      bet: (playerData.bet || 0).toString(),
      cashedOut: (playerData.cashedOut || false).toString(),
      win: (playerData.win || 0).toString(),
    });
    // **client.expire(`player:${socketId}`, 3600)**: Expira el estado del jugador en 1 hora.
    // Esto limpia automáticamente la caché de jugadores inactivos.
    await this.client.expire(`player:${socketId}`, 3600);
  }

  async getPlayer(socketId) {
    // Recupera todos los campos del HASH.
    const data = await this.client.hGetAll(`player:${socketId}`);
    if (!data || !data.id) return null;

    // Convierte los strings de Redis de vuelta a los tipos de datos correctos (float, boolean).
    return {
      id: data.id,
      name: data.name,
      balance: parseFloat(data.balance) || 0,
      bet: parseFloat(data.bet) || 0,
      cashedOut: data.cashedOut === "true", // Conversión de string a boolean
      win: parseFloat(data.win) || 0,
    };
  }

  async updatePlayer(socketId, updates) {
    const stringUpdates = {};
    // Convierte los valores de las actualizaciones a string antes de enviarlos a Redis.
    for (const [key, value] of Object.entries(updates)) {
      stringUpdates[key] = value.toString();
    }
    // hSet actualiza solo los campos proporcionados sin borrar el resto.
    await this.client.hSet(`player:${socketId}`, stringUpdates);
  }

  async deletePlayer(socketId) {
    await this.client.del(`player:${socketId}`);
  }

  async getAllPlayers() {
    // **client.keys("player:*")**: Recupera todas las claves que empiezan con "player:".
    // Nota: 'KEYS' puede ser lento en DBs Redis grandes.
    const playerKeys = await this.client.keys("player:*");
    const players = [];

    for (const key of playerKeys) {
      const data = await this.client.hGetAll(key);
      if (data && data.id) {
        // Mapea y convierte los datos recuperados, similar a getPlayer.
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
    // Cuenta la cantidad de jugadores activos (por sus claves).
    const keys = await this.client.keys("player:*");
    return keys.length;
  }

  async resetAllPlayerBets() {
    // Itera sobre todos los jugadores y pone sus campos de apuesta a cero/falso.
    const playerKeys = await this.client.keys("player:*");
    for (const key of playerKeys) {
      await this.client.hSet(key, {
        bet: "0",
        cashedOut: "false",
        win: "0",
      });
    }
  }

  // ===== OPERACIONES DE LIDERAZGO (Crucial para sistemas distribuidos) =====

  async tryAcquireLeadership(instanceName, ttlSeconds = 5) {
    // **client.set("game:leader", ..., { NX: true, EX: ttlSeconds })**:
    // Intenta establecer la llave de 'game:leader' solo si NO EXISTE (NX).
    // Si tiene éxito (devuelve un valor), esta instancia es el líder.
    // **EX**: Garantiza que el líder expire si la instancia cae (mecanismo de *failover*).
    const result = await this.client.set("game:leader", instanceName, {
      NX: true,
      EX: ttlSeconds,
    });
    // Retorna true si la llave fue establecida (se obtuvo el liderazgo).
    return result !== null;
  }

  async renewLeadership(ttlSeconds = 5) {
    // Solo actualiza el tiempo de vida (TTL) de la llave de liderazgo.
    // Esto se llama periódicamente para mantener el liderazgo.
    await this.client.expire("game:leader", ttlSeconds);
  }

  async getLeader() {
    // Retorna el nombre de la instancia que actualmente es líder.
    return await this.client.get("game:leader");
  }

  // ===== PUB/SUB (Comunicación Inter-Backend) =====

  async publish(channel, message) {
    const data =
      typeof message === "string" ? message : JSON.stringify(message);
    // **this.publisher.publish(...)**: Usa el cliente 'publisher' dedicado
    // para enviar un mensaje a un canal, el cual será recibido por todos los suscriptores.
    await this.publisher.publish(channel, data);
  }

  async subscribe(channel, callback) {
    // **this.subscriber.subscribe(...)**: Usa el cliente 'subscriber' dedicado.
    // El callback se ejecuta cuando llega un mensaje al canal suscrito.
    await this.subscriber.subscribe(channel, (message) => {
      try {
        // Intenta parsear el mensaje de vuelta a objeto JS.
        const data = JSON.parse(message);
        callback(data);
      } catch (error) {
        // Si no es JSON (ej. un string simple), se pasa como está.
        logger.error(`Error parsing message from ${channel}:`, error);
        callback(message);
      }
    });
  }
}

module.exports = RedisService;
