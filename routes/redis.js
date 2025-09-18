const express = require('express');
const { publishEvent, setCache, getCache, deleteCache } = require('../config/redis');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

// Test Redis connection and basic operations
router.get('/test', authenticateUser, async (req, res) => {
  try {
    const testKey = `test:${req.user.id}:${Date.now()}`;
    const testData = { message: 'Redis test', timestamp: new Date().toISOString() };
    
    // Test cache operations
    const setResult = await setCache(testKey, testData, 60); // 1 minute TTL
    const getResult = await getCache(testKey);
    const deleteResult = await deleteCache(testKey);
    
    // Test pub/sub
    const pubResult = await publishEvent('test-channel', {
      type: 'test',
      user: req.user.id,
      message: 'Redis pub/sub test'
    });
    
    res.json({
      redis: {
        cache: {
          set: setResult,
          get: getResult !== null,
          delete: deleteResult,
          data: getResult
        },
        pubsub: {
          publish: pubResult
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Redis test error:', error);
    res.status(500).json({ error: 'Failed to test Redis connection' });
  }
});

// Publish event to Redis
router.post('/publish', authenticateUser, async (req, res) => {
  try {
    const { channel, data } = req.body;
    
    if (!channel || !data) {
      return res.status(400).json({ error: 'Channel and data are required' });
    }
    
    const eventData = {
      ...data,
      userId: req.user.id,
      userEmail: req.user.email
    };
    
    const success = await publishEvent(channel, eventData);
    
    res.json({
      success,
      channel,
      published: success,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Redis publish error:', error);
    res.status(500).json({ error: 'Failed to publish event' });
  }
});

// Cache management
router.post('/cache', authenticateUser, async (req, res) => {
  try {
    const { key, value, ttl = 3600 } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }
    
    const success = await setCache(key, value, ttl);
    
    res.json({
      success,
      key,
      cached: success,
      ttl,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Redis cache error:', error);
    res.status(500).json({ error: 'Failed to cache data' });
  }
});

router.get('/cache/:key', authenticateUser, async (req, res) => {
  try {
    const { key } = req.params;
    const value = await getCache(key);
    
    res.json({
      key,
      value,
      found: value !== null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Redis get cache error:', error);
    res.status(500).json({ error: 'Failed to get cached data' });
  }
});

module.exports = router;