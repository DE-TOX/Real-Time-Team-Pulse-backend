const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const supabase = require('../../config/supabase');
const { authenticateUser } = require('../../middleware/auth');
const sentimentService = require('../services/sentimentService');
const pubsubService = require('../services/pubsubService');
const { setCache, getCache, deleteCache } = require('../../config/redis');
const rateLimit = require('express-rate-limit');
const { calculateAnalytics } = require('../utils/analytics');

const router = express.Router();

// Rate limiting for check-in submissions
const checkInRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 check-ins per 15 minutes per user
  message: {
    error: 'Too many check-ins submitted. Please wait before submitting another.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * components:
 *   schemas:
 *     CheckIn:
 *       type: object
 *       required:
 *         - content
 *         - mood_score
 *         - energy_level
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier for the check-in
 *         team_id:
 *           type: string
 *           format: uuid
 *           description: ID of the team this check-in belongs to
 *         user_id:
 *           type: string
 *           format: uuid
 *           description: ID of the user who submitted the check-in
 *         content:
 *           type: string
 *           minLength: 1
 *           maxLength: 1000
 *           description: The check-in content/message
 *         mood_score:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           description: Mood rating from 1 (very bad) to 5 (excellent)
 *         energy_level:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           description: Energy level from 1 (exhausted) to 5 (energized)
 *         is_anonymous:
 *           type: boolean
 *           default: false
 *           description: Whether this check-in should be anonymous
 *         input_method:
 *           type: string
 *           enum: [text, voice]
 *           default: text
 *           description: How the check-in was submitted
 *         sentiment_score:
 *           type: number
 *           minimum: -1
 *           maximum: 1
 *           description: AI-generated sentiment score
 *         sentiment_label:
 *           type: string
 *           enum: [POSITIVE, NEUTRAL, NEGATIVE]
 *           description: AI-generated sentiment label
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: When the check-in was created
 *         metadata:
 *           type: object
 *           description: Additional metadata for the check-in
 *     CheckInCreate:
 *       type: object
 *       required:
 *         - content
 *         - mood_score
 *         - energy_level
 *       properties:
 *         content:
 *           type: string
 *           minLength: 1
 *           maxLength: 1000
 *           description: The check-in content/message
 *         mood_score:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           description: Mood rating from 1 (very bad) to 5 (excellent)
 *         energy_level:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           description: Energy level from 1 (exhausted) to 5 (energized)
 *         is_anonymous:
 *           type: boolean
 *           default: false
 *           description: Whether this check-in should be anonymous
 *         input_method:
 *           type: string
 *           enum: [text, voice]
 *           default: text
 *           description: How the check-in was submitted
 *     CheckInAnalytics:
 *       type: object
 *       properties:
 *         team_id:
 *           type: string
 *           format: uuid
 *         period:
 *           type: string
 *           description: Time period for analytics
 *         sentiment_trend:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               avg_sentiment:
 *                 type: number
 *               avg_mood:
 *                 type: number
 *               avg_energy:
 *                 type: number
 *               count:
 *                 type: integer
 *         mood_distribution:
 *           type: object
 *           properties:
 *             1:
 *               type: integer
 *             2:
 *               type: integer
 *             3:
 *               type: integer
 *             4:
 *               type: integer
 *             5:
 *               type: integer
 *         energy_distribution:
 *           type: object
 *           properties:
 *             1:
 *               type: integer
 *             2:
 *               type: integer
 *             3:
 *               type: integer
 *             4:
 *               type: integer
 *             5:
 *               type: integer
 *         sentiment_distribution:
 *           type: object
 *           properties:
 *             POSITIVE:
 *               type: integer
 *             NEUTRAL:
 *               type: integer
 *             NEGATIVE:
 *               type: integer
 *         participation_rate:
 *           type: number
 *           description: Percentage of team members who submitted check-ins
 *         total_checkins:
 *           type: integer
 *         insights_count:
 *           type: integer
 */

/**
 * @swagger
 * /api/teams/{teamId}/check-ins:
 *   post:
 *     summary: Submit a new check-in for a team
 *     tags: [Check-ins]
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
 *             $ref: '#/components/schemas/CheckInCreate'
 *           example:
 *             content: "Feeling great today! Deployed the new feature successfully."
 *             mood_score: 5
 *             energy_level: 4
 *             is_anonymous: false
 *             input_method: "text"
 *     responses:
 *       201:
 *         description: Check-in submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CheckIn'
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 *       404:
 *         description: Team not found
 *       429:
 *         description: Too many check-ins submitted
 */
router.post('/:teamId/check-ins',
  authenticateUser,
  checkInRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID'),
    body('content')
      .trim()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Content must be between 1 and 1000 characters'),
    body('mood_score')
      .isInt({ min: 1, max: 5 })
      .withMessage('Mood score must be between 1 and 5'),
    body('energy_level')
      .isInt({ min: 1, max: 5 })
      .withMessage('Energy level must be between 1 and 5'),
    body('is_anonymous')
      .optional()
      .isBoolean()
      .withMessage('is_anonymous must be a boolean'),
    body('input_method')
      .optional()
      .isIn(['text', 'voice'])
      .withMessage('input_method must be either "text" or "voice"'),
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
      const { content, mood_score, energy_level, is_anonymous = false, input_method = 'text' } = req.body;
      const userId = req.user.id;

      // Check if user is a member of the team
      const { data: membership, error: membershipError } = await supabase
        .from('team_members')
        .select('id, role')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .single();

      if (membershipError || !membership) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this team'
        });
      }

      // Check if team allows anonymous check-ins
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('allow_anonymous_checkins')
        .eq('id', teamId)
        .single();

      if (teamError) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      if (is_anonymous && !team.allow_anonymous_checkins) {
        return res.status(400).json({
          success: false,
          message: 'Anonymous check-ins are not allowed for this team'
        });
      }

      // Analyze sentiment
      let sentimentResult;
      try {
        sentimentResult = await sentimentService.analyzeSentiment(content);
      } catch (sentimentError) {
        console.error('Sentiment analysis failed:', sentimentError);
        // Use fallback sentiment analysis
        sentimentResult = sentimentService.fallbackSentimentAnalysis(content);
      }

      // Create check-in with sentiment data
      const { data: checkIn, error: checkInError } = await supabase
        .from('check_ins')
        .insert({
          team_id: teamId,
          user_id: userId,
          content,
          mood_score,
          energy_level,
          is_anonymous,
          input_method,
          sentiment_score: sentimentResult.normalizedScore,
          sentiment_label: sentimentResult.label,
          metadata: {
            sentiment_confidence: sentimentResult.confidence,
            sentiment_fallback: sentimentResult.fallback || false
          }
        })
        .select(`
          *,
          profiles:user_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .single();

      if (checkInError) {
        console.error('Check-in creation error:', checkInError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create check-in'
        });
      }

      // Log event for audit trail
      await supabase
        .from('events')
        .insert({
          event_type: 'check_in_submitted',
          entity_type: 'check_in',
          entity_id: checkIn.id,
          user_id: userId,
          data: {
            team_id: teamId,
            mood_score,
            energy_level,
            sentiment_label: sentimentResult.label,
            is_anonymous
          }
        });

      // Publish real-time check-in event
      try {
        await pubsubService.publishCheckInEvent(teamId, checkIn, userId);
        console.log(`📤 Published check-in event for team ${teamId}`);
      } catch (pubsubError) {
        console.error('Failed to publish check-in event:', pubsubError);
        // Don't fail the check-in if pub/sub fails
      }

      // Invalidate analytics cache for this team
      try {
        const cachePatterns = [
          `analytics:${teamId}:24h:*`,
          `analytics:${teamId}:7d:*`,
          `analytics:${teamId}:30d:*`,
          `analytics:${teamId}:90d:*`
        ];

        // Note: In production, you'd want a more sophisticated cache invalidation
        // For now, we'll invalidate common cache keys
        const periods = ['24h', '7d', '30d', '90d'];
        const anonymousOptions = [true, false];

        for (const period of periods) {
          for (const includeAnon of anonymousOptions) {
            const cacheKey = `analytics:${teamId}:${period}:${includeAnon}`;
            await deleteCache(cacheKey);
          }
        }

        console.log(`🗑️ Invalidated analytics cache for team ${teamId}`);
      } catch (cacheError) {
        console.error('Failed to invalidate analytics cache:', cacheError);
        // Don't fail the check-in if cache invalidation fails
      }

      // Hide user info for anonymous check-ins
      if (is_anonymous) {
        checkIn.profiles = null;
        checkIn.user_id = null;
      }

      res.status(201).json({
        success: true,
        data: checkIn,
        message: 'Check-in submitted successfully'
      });

    } catch (error) {
      console.error('Check-in submission error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/teams/{teamId}/check-ins:
 *   get:
 *     summary: Get team check-ins with filtering and pagination
 *     tags: [Check-ins]
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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of check-ins per page
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter check-ins from this date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter check-ins until this date
 *       - in: query
 *         name: mood_min
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         description: Minimum mood score
 *       - in: query
 *         name: mood_max
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         description: Maximum mood score
 *       - in: query
 *         name: sentiment
 *         schema:
 *           type: string
 *           enum: [POSITIVE, NEUTRAL, NEGATIVE]
 *         description: Filter by sentiment
 *       - in: query
 *         name: include_anonymous
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include anonymous check-ins
 *     responses:
 *       200:
 *         description: List of team check-ins
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CheckIn'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 *       404:
 *         description: Team not found
 */
router.get('/:teamId/check-ins',
  authenticateUser,
  [
    param('teamId').isUUID().withMessage('Invalid team ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('date_from').optional().isISO8601().withMessage('Invalid date_from format'),
    query('date_to').optional().isISO8601().withMessage('Invalid date_to format'),
    query('mood_min').optional().isInt({ min: 1, max: 5 }).withMessage('mood_min must be between 1 and 5'),
    query('mood_max').optional().isInt({ min: 1, max: 5 }).withMessage('mood_max must be between 1 and 5'),
    query('sentiment').optional().isIn(['POSITIVE', 'NEUTRAL', 'NEGATIVE']).withMessage('Invalid sentiment value'),
    query('include_anonymous').optional().isBoolean().withMessage('include_anonymous must be a boolean'),
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
      const {
        page = 1,
        limit = 20,
        date_from,
        date_to,
        mood_min,
        mood_max,
        sentiment,
        include_anonymous = true
      } = req.query;

      const userId = req.user.id;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Check if user is a member of the team
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

      // Build query
      let query = supabase
        .from('check_ins')
        .select(`
          *,
          profiles:user_id (
            id,
            full_name,
            avatar_url
          )
        `, { count: 'exact' })
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (date_from) {
        query = query.gte('created_at', `${date_from}T00:00:00Z`);
      }

      if (date_to) {
        query = query.lte('created_at', `${date_to}T23:59:59Z`);
      }

      if (mood_min) {
        query = query.gte('mood_score', parseInt(mood_min));
      }

      if (mood_max) {
        query = query.lte('mood_score', parseInt(mood_max));
      }

      if (sentiment) {
        query = query.eq('sentiment_label', sentiment);
      }

      if (!include_anonymous) {
        query = query.eq('is_anonymous', false);
      }

      // Apply pagination
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data: checkIns, error: checkInsError, count } = await query;

      if (checkInsError) {
        console.error('Check-ins fetch error:', checkInsError);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch check-ins'
        });
      }

      // Hide user info for anonymous check-ins
      const processedCheckIns = checkIns.map(checkIn => {
        if (checkIn.is_anonymous) {
          return {
            ...checkIn,
            profiles: null,
            user_id: null
          };
        }
        return checkIn;
      });

      const totalPages = Math.ceil(count / parseInt(limit));

      res.json({
        success: true,
        data: processedCheckIns,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      });

    } catch (error) {
      console.error('Check-ins fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/teams/{teamId}/analytics:
 *   get:
 *     summary: Get team analytics and aggregated data
 *     tags: [Check-ins]
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
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d, 90d]
 *           default: 7d
 *         description: Time period for analytics
 *       - in: query
 *         name: include_anonymous
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Include anonymous check-ins in analytics
 *     responses:
 *       200:
 *         description: Team analytics data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CheckInAnalytics'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member or insufficient permissions
 *       404:
 *         description: Team not found
 */
router.get('/:teamId/analytics',
  authenticateUser,
  [
    param('teamId').isUUID().withMessage('Invalid team ID'),
    query('period').optional().isIn(['24h', '7d', '30d', '90d']).withMessage('Invalid period'),
    query('include_anonymous').optional().isBoolean().withMessage('include_anonymous must be a boolean'),
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
      const { period = '7d', include_anonymous = true } = req.query;
      const userId = req.user.id;

      // Check if user is a member of the team (managers get full analytics, members get limited view)
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

      // Calculate date range
      const periodHours = {
        '24h': 24,
        '7d': 24 * 7,
        '30d': 24 * 30,
        '90d': 24 * 90
      };

      const hoursAgo = periodHours[period];
      const fromDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      // Build base query
      let query = supabase
        .from('check_ins')
        .select(`
          created_at,
          mood_score,
          energy_level,
          sentiment_score,
          sentiment_label,
          is_anonymous,
          user_id
        `)
        .eq('team_id', teamId)
        .gte('created_at', fromDate);

      if (!include_anonymous) {
        query = query.eq('is_anonymous', false);
      }

      const { data: checkIns, error: checkInsError } = await query;

      if (checkInsError) {
        console.error('Analytics fetch error:', checkInsError);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch analytics data'
        });
      }

      // Get team member count for participation rate
      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId);

      if (teamMembersError) {
        console.error('Team members fetch error:', teamMembersError);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch team data'
        });
      }

      // Generate cache key for analytics
      const cacheKey = `analytics:${teamId}:${period}:${include_anonymous}:${fromDate}`;

      // Try to get cached analytics first
      let analytics = await getCache(cacheKey);

      if (!analytics) {
        console.log(`🔄 Computing analytics for team ${teamId}, period ${period}`);

        // Calculate analytics
        analytics = calculateAnalytics(checkIns, teamMembers, period);

        // Cache analytics for 5 minutes (300 seconds)
        const cacheSuccess = await setCache(cacheKey, analytics, 300);
        if (cacheSuccess) {
          console.log(`💾 Cached analytics for team ${teamId}`);
        }
      } else {
        console.log(`📦 Retrieved cached analytics for team ${teamId}`);
      }


      // Managers get full analytics, members get limited view
      if (membership.role !== 'manager') {
        // Remove individual user data for members
        delete analytics.individual_trends;
        delete analytics.user_participation;
      }

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/check-ins/me:
 *   get:
 *     summary: Get current user's personal check-ins
 *     tags: [Check-ins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of check-ins per page
 *       - in: query
 *         name: team_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by specific team
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter check-ins from this date
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter check-ins until this date
 *     responses:
 *       200:
 *         description: List of user's check-ins
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CheckIn'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/me',
  authenticateUser,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('team_id').optional().isUUID().withMessage('Invalid team ID'),
    query('date_from').optional().isISO8601().withMessage('Invalid date_from format'),
    query('date_to').optional().isISO8601().withMessage('Invalid date_to format'),
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

      const {
        page = 1,
        limit = 20,
        team_id,
        date_from,
        date_to
      } = req.query;

      const userId = req.user.id;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build query for user's check-ins
      let query = supabase
        .from('check_ins')
        .select(`
          *,
          teams:team_id (
            id,
            name
          )
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (team_id) {
        query = query.eq('team_id', team_id);
      }

      if (date_from) {
        query = query.gte('created_at', `${date_from}T00:00:00Z`);
      }

      if (date_to) {
        query = query.lte('created_at', `${date_to}T23:59:59Z`);
      }

      // Apply pagination
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data: checkIns, error: checkInsError, count } = await query;

      if (checkInsError) {
        console.error('Personal check-ins fetch error:', checkInsError);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch check-ins'
        });
      }

      const totalPages = Math.ceil(count / parseInt(limit));

      res.json({
        success: true,
        data: checkIns,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      });

    } catch (error) {
      console.error('Personal check-ins fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/check-ins/{checkInId}:
 *   delete:
 *     summary: Delete a check-in (own check-ins only)
 *     tags: [Check-ins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: checkInId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Check-in ID
 *     responses:
 *       200:
 *         description: Check-in deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Cannot delete other users' check-ins
 *       404:
 *         description: Check-in not found
 */
router.delete('/:checkInId',
  authenticateUser,
  [
    param('checkInId').isUUID().withMessage('Invalid check-in ID'),
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

      const { checkInId } = req.params;
      const userId = req.user.id;

      // Check if check-in exists and belongs to user
      const { data: checkIn, error: checkInError } = await supabase
        .from('check_ins')
        .select('id, user_id, team_id')
        .eq('id', checkInId)
        .single();

      if (checkInError || !checkIn) {
        return res.status(404).json({
          success: false,
          message: 'Check-in not found'
        });
      }

      if (checkIn.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete your own check-ins'
        });
      }

      // Delete the check-in
      const { error: deleteError } = await supabase
        .from('check_ins')
        .delete()
        .eq('id', checkInId);

      if (deleteError) {
        console.error('Check-in deletion error:', deleteError);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete check-in'
        });
      }

      // Log event for audit trail
      await supabase
        .from('events')
        .insert({
          event_type: 'check_in_deleted',
          entity_type: 'check_in',
          entity_id: checkInId,
          user_id: userId,
          data: {
            team_id: checkIn.team_id
          }
        });

      res.json({
        success: true,
        message: 'Check-in deleted successfully'
      });

    } catch (error) {
      console.error('Check-in deletion error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

module.exports = router;