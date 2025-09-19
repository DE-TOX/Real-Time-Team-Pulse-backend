const express = require('express');
const { param, query, validationResult } = require('express-validator');
const { authenticateUser } = require('../../middleware/auth');
const websocketService = require('../services/websocketService');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for WebSocket management endpoints
const wsManagementRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Maximum 50 requests per 15 minutes
  message: {
    error: 'Too many WebSocket management requests. Please wait before trying again.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * components:
 *   schemas:
 *     WebSocketStats:
 *       type: object
 *       properties:
 *         connectedClients:
 *           type: integer
 *           description: Number of connected WebSocket clients
 *         activeRooms:
 *           type: integer
 *           description: Number of active rooms
 *         activeStreams:
 *           type: integer
 *           description: Number of active data streams
 *         collaborationSessions:
 *           type: integer
 *           description: Number of active collaboration sessions
 *         userSessions:
 *           type: integer
 *           description: Number of active user sessions
 *         uptime:
 *           type: number
 *           description: Server uptime in seconds
 *         timestamp:
 *           type: string
 *           format: date-time
 *     WebSocketConnection:
 *       type: object
 *       properties:
 *         socketId:
 *           type: string
 *           description: Socket connection ID
 *         userId:
 *           type: string
 *           format: uuid
 *         email:
 *           type: string
 *           format: email
 *         connectedAt:
 *           type: string
 *           format: date-time
 *         lastSeen:
 *           type: string
 *           format: date-time
 *         rooms:
 *           type: array
 *           items:
 *             type: string
 *     CollaborationSession:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         teamId:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [whiteboard, document, meeting]
 *         createdBy:
 *           type: string
 *           format: uuid
 *         participants:
 *           type: array
 *           items:
 *             type: string
 *             format: uuid
 *         status:
 *           type: string
 *           enum: [active, paused, ended]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         lastActivity:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/websocket/stats:
 *   get:
 *     summary: Get WebSocket server statistics
 *     tags: [WebSocket & Live Updates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: WebSocket server statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   $ref: '#/components/schemas/WebSocketStats'
 *       401:
 *         description: Unauthorized
 */
router.get('/stats', authenticateUser, wsManagementRateLimit, async (req, res) => {
  try {
    const stats = websocketService.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get WebSocket stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WebSocket statistics'
    });
  }
});

/**
 * @swagger
 * /api/websocket/rooms:
 *   get:
 *     summary: Get active WebSocket rooms
 *     tags: [WebSocket & Live Updates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active rooms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 rooms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       teamId:
 *                         type: string
 *                         format: uuid
 *                       type:
 *                         type: string
 *                       memberCount:
 *                         type: integer
 *                       lastActivity:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/rooms', authenticateUser, wsManagementRateLimit, async (req, res) => {
  try {
    const rooms = [];

    websocketService.rooms.forEach((room, roomId) => {
      rooms.push({
        id: roomId,
        teamId: room.teamId,
        type: room.type,
        memberCount: room.members.size,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity
      });
    });

    res.json({
      success: true,
      rooms: rooms.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
    });
  } catch (error) {
    console.error('Get WebSocket rooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WebSocket rooms'
    });
  }
});

/**
 * @swagger
 * /api/websocket/connections:
 *   get:
 *     summary: Get active WebSocket connections (admin only)
 *     tags: [WebSocket & Live Updates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active connections
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 connections:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WebSocketConnection'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get('/connections', authenticateUser, wsManagementRateLimit, async (req, res) => {
  try {
    // Check if user is admin
    const { data: profile } = await require('../../config/supabase')
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const connections = [];

    websocketService.socketUsers.forEach((userData, socketId) => {
      connections.push({
        socketId,
        userId: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        connectedAt: userData.connectedAt,
        lastSeen: userData.lastSeen,
        isMobileActive: userData.isMobileActive || false
      });
    });

    res.json({
      success: true,
      connections: connections.sort((a, b) => new Date(b.connectedAt) - new Date(a.connectedAt))
    });
  } catch (error) {
    console.error('Get WebSocket connections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get WebSocket connections'
    });
  }
});

/**
 * @swagger
 * /api/websocket/teams/{teamId}/broadcast:
 *   post:
 *     summary: Broadcast message to team room
 *     tags: [WebSocket & Live Updates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event
 *               - data
 *             properties:
 *               event:
 *                 type: string
 *                 description: Event name
 *                 example: "custom_notification"
 *               data:
 *                 type: object
 *                 description: Event data
 *                 example:
 *                   message: "Team meeting in 5 minutes"
 *                   priority: "high"
 *               roomType:
 *                 type: string
 *                 enum: [general, analytics, collaboration]
 *                 default: general
 *                 description: Room type to broadcast to
 *     responses:
 *       200:
 *         description: Message broadcast successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 roomId:
 *                   type: string
 *                 event:
 *                   type: string
 *                 broadcastAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member or insufficient permissions
 *       404:
 *         description: Team not found
 */
router.post('/teams/:teamId/broadcast',
  authenticateUser,
  wsManagementRateLimit,
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
      const { event, data, roomType = 'general' } = req.body;
      const userId = req.user.id;

      if (!event || !data) {
        return res.status(400).json({
          success: false,
          message: 'Event and data are required'
        });
      }

      // Check team membership
      const { data: membership, error } = await require('../../config/supabase')
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .single();

      if (error || !membership) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this team'
        });
      }

      const roomId = `team_${teamId}_${roomType}`;

      // Broadcast message
      websocketService.broadcastToRoom(roomId, event, {
        ...data,
        sentBy: {
          id: userId,
          email: req.user.email
        },
        timestamp: new Date().toISOString()
      });

      res.json({
        success: true,
        roomId,
        event,
        broadcastAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Broadcast message error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to broadcast message'
      });
    }
  }
);

/**
 * @swagger
 * /api/websocket/collaboration/sessions:
 *   get:
 *     summary: Get active collaboration sessions
 *     tags: [WebSocket & Live Updates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: teamId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by team ID
 *     responses:
 *       200:
 *         description: List of active collaboration sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CollaborationSession'
 *       401:
 *         description: Unauthorized
 */
router.get('/collaboration/sessions',
  authenticateUser,
  wsManagementRateLimit,
  [
    query('teamId').optional().isUUID().withMessage('Invalid team ID')
  ],
  async (req, res) => {
    try {
      const { teamId } = req.query;
      const sessions = [];

      websocketService.collaborationSessions.forEach((session, sessionId) => {
        // Filter by team if specified
        if (teamId && session.teamId !== teamId) {
          return;
        }

        sessions.push({
          id: sessionId,
          teamId: session.teamId,
          type: session.type,
          createdBy: session.createdBy,
          participants: Array.from(session.participants),
          status: session.status,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          metadata: session.metadata
        });
      });

      res.json({
        success: true,
        sessions: sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
      });

    } catch (error) {
      console.error('Get collaboration sessions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get collaboration sessions'
      });
    }
  }
);

/**
 * @swagger
 * /api/websocket/collaboration/sessions/{sessionId}/end:
 *   post:
 *     summary: End collaboration session
 *     tags: [WebSocket & Live Updates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Collaboration session ID
 *     responses:
 *       200:
 *         description: Collaboration session ended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sessionId:
 *                   type: string
 *                   format: uuid
 *                 endedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to end this session
 *       404:
 *         description: Session not found
 */
router.post('/collaboration/sessions/:sessionId/end',
  authenticateUser,
  wsManagementRateLimit,
  [
    param('sessionId').isUUID().withMessage('Invalid session ID')
  ],
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;

      const session = websocketService.collaborationSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Collaboration session not found'
        });
      }

      // Check if user can end the session (creator or team manager)
      const canEnd = session.createdBy === userId || session.participants.has(userId);

      if (!canEnd) {
        // Check if user is team manager
        const { data: membership } = await require('../../config/supabase')
          .from('team_members')
          .select('role')
          .eq('team_id', session.teamId)
          .eq('user_id', userId)
          .single();

        if (!membership || membership.role !== 'manager') {
          return res.status(403).json({
            success: false,
            message: 'Not authorized to end this collaboration session'
          });
        }
      }

      // End the session
      session.status = 'ended';
      session.endedAt = new Date().toISOString();
      session.endedBy = userId;

      // Notify all participants
      const collaborationRoom = `collaboration_${sessionId}`;
      websocketService.io.to(collaborationRoom).emit('collaboration_ended', {
        sessionId,
        endedBy: userId,
        timestamp: session.endedAt
      });

      res.json({
        success: true,
        sessionId,
        endedAt: session.endedAt
      });

    } catch (error) {
      console.error('End collaboration session error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to end collaboration session'
      });
    }
  }
);

/**
 * @swagger
 * /api/websocket/streams:
 *   get:
 *     summary: Get active data streams
 *     tags: [WebSocket & Live Updates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [analytics, team_events]
 *         description: Filter by stream type
 *     responses:
 *       200:
 *         description: List of active data streams
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 streams:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       teamId:
 *                         type: string
 *                         format: uuid
 *                       isActive:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       lastUpdate:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get('/streams',
  authenticateUser,
  wsManagementRateLimit,
  [
    query('type').optional().isIn(['analytics', 'team_events']).withMessage('Invalid stream type')
  ],
  async (req, res) => {
    try {
      const { type } = req.query;
      const streams = [];

      websocketService.activeStreams.forEach((stream, streamId) => {
        // Filter by type if specified
        if (type && stream.type !== type) {
          return;
        }

        streams.push({
          id: streamId,
          type: stream.type,
          teamId: stream.teamId,
          userId: stream.userId,
          isActive: stream.isActive !== false,
          isPaused: stream.isPaused || false,
          createdAt: stream.createdAt,
          lastUpdate: stream.lastUpdate
        });
      });

      res.json({
        success: true,
        streams: streams.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      });

    } catch (error) {
      console.error('Get streams error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get data streams'
      });
    }
  }
);

module.exports = router;