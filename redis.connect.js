require('dotenv').config();

// Redis désactivé par défaut. Activer avec REDIS_ENABLED=true dans .env
const redisEnabled = process.env.REDIS_ENABLED === 'true' || process.env.REDIS_ENABLED === '1';

let client;
let isRedisConnectedFn = () => false;

if (redisEnabled) {
  try {
    const Redis = require('ioredis');
    client = new Redis({
      host: process.env.redis_host || process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.redis_port || process.env.REDIS_PORT || '6379', 10)
    });
    client.on('error', (err) => console.error('Redis Error', err));
    client.on('connect', () => console.log('✅ Redis connected (shared)'));
    isRedisConnectedFn = () => client.status === 'ready';
  } catch (err) {
    console.warn('Redis non disponible, utilisation du mode sans Redis:', err.message);
    client = createStubClient();
  }
} else {
  client = createStubClient();
  console.log('ℹ️ Redis désactivé (REDIS_ENABLED != true). Sessions et cache en mémoire non utilisés.');
}

function createStubClient() {
  return {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve('OK'),
    del: () => Promise.resolve(0),
    keys: () => Promise.resolve([]),
    duplicate: function () { return this; }
  };
}

module.exports = {
  client,
  isRedisConnected: isRedisConnectedFn,
  redisEnabled  // true si REDIS_ENABLED=true (connexion en cours ou établie)
};
