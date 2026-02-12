require('dotenv').config();
const Redis = require('ioredis');

const client = new Redis({
  host: process.env.redis_host || process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.redis_port || process.env.REDIS_PORT || '6379', 10)
});

client.on('error', (err) => console.error('Redis Error', err));
client.on('connect', () => console.log('✅ Redis connected (shared)'));

function isRedisConnected() {
  return client.status === 'ready';
}

module.exports = {
  client,
  isRedisConnected
};