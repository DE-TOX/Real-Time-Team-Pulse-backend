const express = require('express');
const { param, query, body, validationResult } = require('express-validator');
const supabase = require('../../config/supabase');
const { authenticateUser } = require('../../middleware/auth');
const realtimeService = require('../services/realtimeService');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for realtime endpoints
const realtimeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Maximum 100 requests per 15 minutes
  message: {
    error: 'Too many realtime requests. Please wait before trying again.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * components:
 *   schemas:
 *     RealtimeStatus:
 *       type: object
 *       properties:
 *         connection_status:
 *           type: string
 *           enum: [connected, connecting, disconnected, error]
 *         reconnect_attempts:
 *           type: integer
 *         active_channels:
 *           type: integer
 *         presence_channels:
 *           type: integer
 *         channels:
 *           type: array
 *           items:
 *              type: string
 *     PresenceInfo:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         team_id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         channel:
 *           type: string
 *         message:
 *           type: string
 *         timestamp:
 *           type: string
 *           format: date-time
 *     SubscriptionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         subscription:
 *           type: object
 *           properties:
 *             channel:
 *               type: string
 *             team_id:
 *               type: string
 *               format: uuid
 *             type:
 *               type: string
 *             subscribed_at:
 *               type: string
 *               format: date-time
 *         message:
 *           type: string
 */

/**
 * @swagger
* /api/realtime/status:
 *   get:
 *     summary: Get Supabase realtime connection status
 *     tags: [Supabase Realtime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Realtime connection status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   $ref: '#/components/schemas/RealtimeStatus'
 *       401:
 *         description: Unauthorized
 */
router.get('/status', authenticateUser, realtimeRateLimit, async (req, res) => {
  try {
    const status = realtimeService.getStatus();

    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error('Get realtime status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get realtime status'
    });
  }
});

/**
 * @swagger
* /api/realtime/teams/{teamId}/checkins/subscribe:
 *   post:
 *     summary: Subscribe to real-time check-ins for a team
 *     tags: [Supabase Realtime]
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
 *         description: Successfully subscribed to team check-ins
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 *       500:
 *         description: Subscription failed
 */
router.post('/teams/:teamId/checkins/subscribe',
    authenticateUser,
  realtimeRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { teamId } = req.params;
      const userId = req.user.id;

      // Check team membership
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

      // Create subscription with callback
      const channel = realtimeService.subscribeToTeamCheckIns(
        teamId,
        (event) => {
          console.log(`📡 Check-in event for team ${teamId}:`, event);
          // In a real WebSocket implementation, you would send this to connected clients
          // For now, we just log it and it's available via the subscription
        }
      );

      if (!channel) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create subscription'
        });
      }

      res.json({
        success: true,
        subscription: {
          channel: `team_${teamId}_checkins`,
          team_id: teamId,
          type: 'team_checkins',
          subscribed_at: new Date().toISOString()
        },
        message: 'Successfully subscribed to real-time check-ins'
      });
    } catch (error) {
      console.error('Subscribe to team check-ins error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/realtime/teams/{teamId}/insights/subscribe:
 *   post:
 *     summary: Subscribe to real-time insights for a team
 *     tags: [Supabase Realtime]
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
 *         description: Successfully subscribed to team insights
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 */
router.post('/teams/:teamId/insights/subscribe',
  authenticateUser,
  realtimeRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID')
    ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { teamId } = req.params;
      const userId = req.user.id;

      // Check team membership
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

      const channel = realtimeService.subscribeToTeamInsights(
        teamId,
        (event) => {
          console.log(`📡 Insight event for team ${teamId}:`, event);
        }
      );

      if (!channel) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create subscription'
        });
      }

      res.json({
        success: true,
        subscription: {
          channel: `team_${teamId}_insights`,
          team_id: teamId,
          type: 'team_insights',
          subscribed_at: new Date().toISOString()
        },
        message: 'Successfully subscribed to real-time insights'
      });
    } catch (error) {
      console.error('Subscribe to team insights error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/realtime/teams/{teamId}/dashboard/subscribe:
 *   post:
 *     summary: Subscribe to live dashboard updates for a team
 *     tags: [Supabase Realtime]
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
 *         description: Successfully subscribed to live dashboard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 */
router.post('/teams/:teamId/dashboard/subscribe',
  authenticateUser,
  realtimeRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID')
    ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { teamId } = req.params;
      const userId = req.user.id;

      // Check team membership
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

      const channel = realtimeService.subscribeToLiveDashboard(
        teamId,
        (event) => {
          console.log(`📡 Dashboard event for team ${teamId}:`, event);
        }
      );

      if (!channel) {
        return res.status(500).json({
          success: false,
          message: 'Failed to create subscription'
        });
      }

      res.json({
        success: true,
        subscription: {
          channel: `dashboard_${teamId}`,
          team_id: teamId,
          type: 'live_dashboard',
          subscribed_at: new Date().toISOString()
        },
        message: 'Successfully subscribed to live dashboard updates'
      });
    } catch (error) {
      console.error('Subscribe to live dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/realtime/teams/{teamId}/presence/join:
 *   post:
 *     summary: Join team presence (show as active user)
 *     tags: [Supabase Realtime]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID to join presence for
 *     responses:
 *       200:
 *         description: Successfully joined team presence
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PresenceInfo'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 */
router.post('/teams/:teamId/presence/join',
  authenticateUser,
  realtimeRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { teamId } = req.params;
      const userId = req.user.id;

      // Check team membership and get user profile
      const { data: membership, error: membershipError } = await supabase
        .from('team_members')
        .select('role, profiles!user_id(id, full_name, avatar_url)')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .single();

      if (membershipError || !membership) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this team'
        });
      }

      const userInfo = membership.profiles;
      const channel = realtimeService.subscribeToTeamPresence(
        teamId,
        userId,
        userInfo,
        (event) => {
          console.log(`📡 Presence event for team ${teamId}:`, event);
        }
      );

      if (!channel) {
        return res.status(500).json({
          success: false,
          message: 'Failed to join team presence'
        });
      }

      res.json({
        success: true,
        team_id: teamId,
        user_id: userId,
        channel: `presence_team_${teamId}`,
        message: 'Successfully joined team presence',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Join team presence error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/realtime/teams/{teamId}/presence/leave:
 *   post:
 *     summary: Leave team presence (stop showing as active)
 *     tags: [Supabase Realtime]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID to leave presence for
 *     responses:
 *       200:
 *         description: Successfully left team presence
 *       401:
 *         description: Unauthorized
 */
router.post('/teams/:teamId/presence/leave',
  authenticateUser,
  realtimeRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID')
    ],
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const channelName = `presence_team_${teamId}`;

      const success = realtimeService.unsubscribe(channelName);
      res.json({
        success,
        team_id: teamId,
        message: success ? 'Successfully left team presence' : 'No active presence found',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Leave team presence error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/realtime/teams/{teamId}/unsubscribe:
 *   post:
 *     summary: Unsubscribe from all team real-time channels
 *     tags: [Supabase Realtime]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID to unsubscribe from
 *     responses:
 *       200:
 *         description: Successfully unsubscribed from team channels
 *       401:
 *         description: Unauthorized
 */
router.post('/teams/:teamId/unsubscribe',
  authenticateUser,
  realtimeRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID')
  ],
  async (req, res) => {
    try {
      const { teamId } = req.params;

      realtimeService.unsubscribeFromTeam(teamId);

      res.json({
        success: true,
        team_id: teamId,
        message: 'Successfully unsubscribed from all team channels',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Unsubscribe from team error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/realtime/subscriptions:
 *   get:
 *     summary: Get all active real-time subscriptions
 *     tags: [Supabase Realtime]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active subscriptions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 subscriptions:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       team_id:
 *                         type: string
 *                         format: uuid
 *                       type:
 *                         type: string
 *                       subscribed_at:
 *                         type: string
 *                         format: date-time
 *                 realtime_status:
 *                   type: string
 *                 total_subscriptions:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/subscriptions', authenticateUser, realtimeRateLimit, async (req, res) => {
  try {
    const subscriptions = realtimeService.getActiveSubscriptions();

    res.json({
      success: true,
      ...subscriptions
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;



    




    
