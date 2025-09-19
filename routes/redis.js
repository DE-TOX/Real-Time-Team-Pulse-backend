const express = require('express');
const { publishEvent, setCache, getCache, deleteCache } = require('../config/redis');
const { authenticateUser } = require('../middleware/auth');
const pubsubService = require('../src/services/pubsubService');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     RedisTestResult:
 *       type: object
 *       properties:
 *         redis:
 *           type: object
 *           properties:
 *             cache:
 *               type: object
 *               properties:
 *                 set:
 *                   type: boolean
 *                 get:
 *                   type: boolean
 *                 delete:
 *                   type: boolean
 *                 data:
 *                   type: object
 *             pubsub:
 *               type: object
 *               properties:
 *                 publish:
 *                   type: boolean
 *         timestamp:
 *           type: string
 *           format: date-time
 *     SubscriptionInfo:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         subscription:
 *           type: object
 *           properties:
 *             key:
 *               type: string
 *               description: Subscription key for tracking
 *             channel:
 *               type: string
 *               description: Redis pub/sub channel name
 *             type:
 *               type: string
 *               description: Type of subscription
 *             teamId:
 *               type: string
 *               format: uuid
 *             message:
 *               type: string
 *               description: Information about WebSocket connection
 *         timestamp:
 *           type: string
 *           format: date-time
 *     PublishEventRequest:
 *       type: object
 *       required:
 *         - teamId
 *       properties:
 *         teamId:
 *           type: string
 *           format: uuid
 *           description: Team ID for the event
 *         eventType:
 *           type: string
 *           enum: [activity, checkin, alert]
 *           default: activity
 *           description: Type of event to publish
 *     ActiveSubscriptions:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         subscriptions:
 *           type: object
 *           additionalProperties:
 *             type: object
 *             properties:
 *               channel:
 *                 type: string
 *               type:
 *                 type: string
 *               teamId:
 *                 type: string
 *                 nullable: true
 *               userId:
 *                 type: string
 *                 nullable: true
 *         count:
 *           type: integer
 *         timestamp:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/redis/test:
 *   get:
 *     summary: Test Redis connection and basic operations
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Redis test completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RedisTestResult'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Redis connection failed
 */

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

/**
 * @swagger
 * /api/redis/publish:
 *   post:
 *     summary: Publish event to Redis pub/sub channel
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - channel
 *               - data
 *             properties:
 *               channel:
 *                 type: string
 *                 description: Redis channel name
 *                 example: "test-channel"
 *               data:
 *                 type: object
 *                 description: Event data to publish
 *                 example:
 *                   message: "Hello World"
 *                   timestamp: "2025-01-19T12:00:00Z"
 *     responses:
 *       200:
 *         description: Event published successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 channel:
 *                   type: string
 *                 published:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Channel and data are required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to publish event
 */

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

/**
 * @swagger
 * /api/redis/cache:
 *   post:
 *     summary: Store data in Redis cache
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *               - value
 *             properties:
 *               key:
 *                 type: string
 *                 description: Cache key
 *                 example: "user:123:session"
 *               value:
 *                 description: Value to cache (any type)
 *                 example:
 *                   userId: 123
 *                   sessionData: "active"
 *               ttl:
 *                 type: integer
 *                 description: Time to live in seconds
 *                 default: 3600
 *                 example: 1800
 *     responses:
 *       200:
 *         description: Data cached successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 key:
 *                   type: string
 *                 cached:
 *                   type: boolean
 *                 ttl:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Key and value are required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to cache data
 */

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

/**
 * @swagger
 * /api/redis/cache/{key}:
 *   get:
 *     summary: Retrieve data from Redis cache
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Cache key to retrieve
 *         example: "user:123:session"
 *     responses:
 *       200:
 *         description: Cache data retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *                 value:
 *                   description: Cached value (null if not found)
 *                 found:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to get cached data
 */

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

/**
 * @swagger
 * /api/redis/subscribe/team/{teamId}/activity:
 *   post:
 *     summary: Subscribe to team activity stream
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID to subscribe to
 *     responses:
 *       200:
 *         description: Activity subscription configured successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionInfo'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 *       500:
 *         description: Failed to set up subscription
 */

// Subscribe to team activity stream
router.post('/subscribe/team/:teamId/activity', authenticateUser, async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user is a member of the team
    const supabase = require('../config/supabase');
    const { data: membership, error: membershipError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    // For demo purposes, we'll return subscription info
    // In a real implementation, you'd set up WebSocket connections
    const subscriptionKey = `team_activity_${teamId}`;
    const channelName = pubsubService.getChannelName('TEAM_ACTIVITY', { teamId });

    res.json({
      success: true,
      subscription: {
        key: subscriptionKey,
        channel: channelName,
        type: 'team_activity',
        teamId,
        message: 'Subscription configured. Connect via WebSocket for real-time updates.'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Team activity subscription error:', error);
    res.status(500).json({ error: 'Failed to set up subscription' });
  }
});

/**
 * @swagger
 * /api/redis/subscribe/team/{teamId}/checkins:
 *   post:
 *     summary: Subscribe to team check-ins stream
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID to subscribe to
 *     responses:
 *       200:
 *         description: Check-ins subscription configured successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionInfo'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 *       500:
 *         description: Failed to set up subscription
 */

// Subscribe to team check-ins stream
router.post('/subscribe/team/:teamId/checkins', authenticateUser, async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check team membership
    const supabase = require('../config/supabase');
    const { data: membership, error: membershipError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    const subscriptionKey = `team_checkins_${teamId}`;
    const channelName = pubsubService.getChannelName('TEAM_CHECKINS', { teamId });

    res.json({
      success: true,
      subscription: {
        key: subscriptionKey,
        channel: channelName,
        type: 'team_checkins',
        teamId,
        message: 'Check-in subscription configured. Connect via WebSocket for real-time updates.'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Team check-ins subscription error:', error);
    res.status(500).json({ error: 'Failed to set up subscription' });
  }
});

/**
 * @swagger
 * /api/redis/subscribe/team/{teamId}/alerts:
 *   post:
 *     summary: Subscribe to team alerts stream (managers only)
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID to subscribe to
 *     responses:
 *       200:
 *         description: Alerts subscription configured successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionInfo'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member or not a manager
 *       500:
 *         description: Failed to set up subscription
 */

// Subscribe to team alerts stream
router.post('/subscribe/team/:teamId/alerts', authenticateUser, async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    // Check if user is a manager
    const supabase = require('../config/supabase');
    const { data: membership, error: membershipError } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this team'
      });
    }

    if (membership.role !== 'manager') {
      return res.status(403).json({
        success: false,
        message: 'Only managers can subscribe to alerts'
      });
    }

    const subscriptionKey = `team_alerts_${teamId}`;
    const channelName = pubsubService.getChannelName('TEAM_ALERTS', { teamId });

    res.json({
      success: true,
      subscription: {
        key: subscriptionKey,
        channel: channelName,
        type: 'team_alerts',
        teamId,
        message: 'Alert subscription configured. Connect via WebSocket for real-time updates.'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Team alerts subscription error:', error);
    res.status(500).json({ error: 'Failed to set up subscription' });
  }
});

/**
 * @swagger
 * /api/redis/subscriptions:
 *   get:
 *     summary: Get active pub/sub subscriptions for debugging
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active subscriptions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ActiveSubscriptions'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to get subscriptions
 */

// Get active subscriptions for debugging
router.get('/subscriptions', authenticateUser, async (req, res) => {
  try {
    const subscriptions = pubsubService.getActiveSubscriptions();

    res.json({
      success: true,
      subscriptions,
      count: Object.keys(subscriptions).length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Failed to get subscriptions' });
  }
});

/**
 * @swagger
 * /api/redis/debug/publish-test-event:
 *   post:
 *     summary: Publish test events for debugging pub/sub functionality
 *     tags: [Redis & Pub/Sub]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PublishEventRequest'
 *           example:
 *             teamId: "123e4567-e89b-12d3-a456-426614174000"
 *             eventType: "checkin"
 *     responses:
 *       200:
 *         description: Test event published successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 eventType:
 *                   type: string
 *                 teamId:
 *                   type: string
 *                   format: uuid
 *                 published:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: teamId is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to publish test event
 */

// Publish test events for debugging
router.post('/debug/publish-test-event', authenticateUser, async (req, res) => {
  try {
    const { teamId, eventType = 'test' } = req.body;
    const userId = req.user.id;

    if (!teamId) {
      return res.status(400).json({ error: 'teamId is required' });
    }

    let result;
    switch (eventType) {
      case 'checkin':
        result = await pubsubService.publishCheckInEvent(teamId, {
          id: 'test-checkin',
          mood_score: 4,
          energy_level: 3,
          sentiment_label: 'POSITIVE',
          is_anonymous: false,
          created_at: new Date().toISOString()
        }, userId);
        break;

      case 'alert':
        result = await pubsubService.publishAlertEvent(teamId, {
          id: 'test-alert',
          title: 'Test Alert',
          severity: 'info',
          generated_at: new Date().toISOString(),
          metadata: { priority: 4 }
        });
        break;

      case 'activity':
      default:
        result = await pubsubService.publishTeamActivity(teamId, 'test_activity', {
          message: 'This is a test activity event'
        }, userId);
        break;
    }

    res.json({
      success: result,
      eventType,
      teamId,
      published: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Debug publish error:', error);
    res.status(500).json({ error: 'Failed to publish test event' });
  }
});

module.exports = router;