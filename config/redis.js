const Redis = require('ioredis');

let redis = null;
let subscriber = null;
let publisher = null;

const connectRedis = () => {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.warn('⚠️  REDIS_URL not provided, Redis features will be disabled');
    return null;
  }

  try {
    // Main Redis connection
    redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4, // Use IPv4
    });

    // Separate connections for pub/sub
    publisher = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    subscriber = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      console.log('✅ Connected to Redis');
    });

    redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
    });

    redis.on('ready', () => {
      console.log('🚀 Redis is ready');
    });

    redis.on('close', () => {
      console.log('🔌 Redis connection closed');
    });

    return redis;
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error.message);
    return null;
  }
};

// Pub/Sub functions
const publishEvent = async (channel, data) => {
  if (!publisher) return false;
  
  try {
    const message = JSON.stringify({
      ...data,
      timestamp: new Date().toISOString(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });
    
    await publisher.publish(channel, message);
    console.log(`📤 Published to ${channel}:`, data);
    return true;
  } catch (error) {
    console.error('❌ Error publishing event:', error.message);
    return false;
  }
};

const subscribeToChannel = (channel, callback) => {
  if (!subscriber) return null;

  subscriber.subscribe(channel, (err, count) => {
    if (err) {
      console.error(`❌ Error subscribing to ${channel}:`, err.message);
      return;
    }
    console.log(`📥 Subscribed to ${channel} (${count} total subscriptions)`);
  });

  subscriber.on('message', (receivedChannel, message) => {
    if (receivedChannel === channel) {
      try {
        const data = JSON.parse(message);
        callback(data);
      } catch (error) {
        console.error('❌ Error parsing message:', error.message);
      }
    }
  });

  return subscriber;
};

// Cache functions
const setCache = async (key, value, ttlSeconds = 3600) => {
  if (!redis) return false;
  
  try {
    const serialized = JSON.stringify(value);
    await redis.setex(key, ttlSeconds, serialized);
    return true;
  } catch (error) {
    console.error('❌ Error setting cache:', error.message);
    return false;
  }
};

const getCache = async (key) => {
  if (!redis) return null;
  
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('❌ Error getting cache:', error.message);
    return null;
  }
};

const deleteCache = async (key) => {
  if (!redis) return false;
  
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('❌ Error deleting cache:', error.message);
    return false;
  }
};

// Cleanup function
const closeConnections = async () => {
  try {
    if (redis) await redis.quit();
    if (publisher) await publisher.quit();
    if (subscriber) await subscriber.quit();
    console.log('✅ Redis connections closed');
  } catch (error) {
    console.error('❌ Error closing Redis connections:', error.message);
  }
};

module.exports = {
  redis: connectRedis(),
  connectRedis,
  publishEvent,
  subscribeToChannel,
  setCache,
  getCache,
  deleteCache,
  closeConnections
};
