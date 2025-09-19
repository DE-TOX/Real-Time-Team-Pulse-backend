const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const supabase = require('../../config/supabase');
const { authenticateUser } = require('../../middleware/auth');
const insightsService = require('../services/insightsService');
const alertService = require('../services/alertService');
const exportService = require('../services/exportService');
const rateLimit = require('express-rate-limit');
const { calculateAnalytics } = require('../utils/analytics');

const router = express.Router();

// Rate limiting for insights endpoints
const insightsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Maximum 50 requests per 15 minutes
  message: {
    error: 'Too many insights requests. Please wait before trying again.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * components:
 *   schemas:
 *     TeamInsight:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         team_id:
 *           type: string
 *           format: uuid
 *         insight_type:
 *           type: string
 *           enum: [daily, weekly, monthly, alert]
 *         title:
 *           type: string
 *         content:
 *           type: string
 *         severity:
 *           type: string
 *           enum: [info, warning, critical]
 *         generated_at:
 *           type: string
 *           format: date-time
 *         metadata:
 *           type: object
 *     AlertRule:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *         triggered:
 *           type: boolean
 *         severity:
 *           type: string
 *         title:
 *           type: string
 *         priority:
 *           type: integer
 */

/**
 * @swagger
 * /api/teams/{teamId}/insights:
 *   get:
 *     summary: Get team insights and AI-generated recommendations
 *     tags: [Analytics & Insights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, alert]
 *         description: Filter by insight type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       200:
 *         description: Team insights retrieved successfully
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
 *                     $ref: '#/components/schemas/TeamInsight'
 */
router.get('/:teamId/insights',
  authenticateUser,
  insightsRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID'),
    query('type').optional().isIn(['daily', 'weekly', 'monthly', 'alert']).withMessage('Invalid insight type'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
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
      const { type, limit = 10 } = req.query;
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

      // Build query
      let query = supabase
        .from('team_insights')
        .select('*')
        .eq('team_id', teamId)
        .order('generated_at', { ascending: false })
        .limit(parseInt(limit));

      if (type) {
        query = query.eq('insight_type', type);
      }

      const { data: insights, error: insightsError } = await query;

      if (insightsError) {
        console.error('Insights fetch error:', insightsError);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch insights'
        });
      }

      res.json({
        success: true,
        data: insights
      });

    } catch (error) {
      console.error('Get insights error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/teams/{teamId}/insights/generate:
 *   post:
 *     summary: Generate new AI insights for team
 *     tags: [Analytics & Insights]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [daily, weekly, monthly]
 *                 default: weekly
 *               period:
 *                 type: string
 *                 enum: [24h, 7d, 30d]
 *                 default: 7d
 *     responses:
 *       201:
 *         description: Insight generated successfully
 */
router.post('/:teamId/insights/generate',
  authenticateUser,
  insightsRateLimit,
  [
    param('teamId').isUUID().withMessage('Invalid team ID'),
    body('type').optional().isIn(['daily', 'weekly', 'monthly']).withMessage('Invalid insight type'),
    body('period').optional().isIn(['24h', '7d', '30d']).withMessage('Invalid period'),
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
      const { type = 'weekly', period = '7d' } = req.body;
      const userId = req.user.id;

      // Check if user is a manager
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
          message: 'Only managers can generate insights'
        });
      }

      // Get team analytics data first
      const periodHours = {
        '24h': 24,
        '7d': 24 * 7,
        '30d': 24 * 30
      };

      const hoursAgo = periodHours[period];
      const fromDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      // Fetch check-ins and team data
      const { data: checkIns, error: checkInsError } = await supabase
        .from('check_ins')
        .select('*')
        .eq('team_id', teamId)
        .gte('created_at', fromDate);

      if (checkInsError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch team data'
        });
      }

      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId);

      if (teamMembersError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch team members'
        });
      }

      // Calculate analytics
      const teamData = calculateAnalytics(checkIns, teamMembers, period);

      // Generate AI insight
      const insight = await insightsService.generateTeamInsight(teamData, type);

      // Store insight in database
      const { data: storedInsight, error: storeError } = await supabase
        .from('team_insights')
        .insert({
          team_id: teamId,
          insight_type: insight.type,
          title: insight.title,
          content: insight.content,
          severity: insight.severity,
          metadata: insight.metadata
        })
        .select()
        .single();

      if (storeError) {
        console.error('Store insight error:', storeError);
        return res.status(500).json({
          success: false,
          message: 'Failed to store insight'
        });
      }

      res.status(201).json({
        success: true,
        data: storedInsight,
        message: 'Insight generated successfully'
      });

    } catch (error) {
      console.error('Generate insight error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/teams/{teamId}/alerts:
 *   get:
 *     summary: Get active alerts for team
 *     tags: [Analytics & Insights]
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
 *         name: hours
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 168
 *           default: 72
 *         description: Hours to look back for alerts
 *     responses:
 *       200:
 *         description: Active alerts retrieved successfully
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
 *                     $ref: '#/components/schemas/AlertRule'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a team member
 */
router.get('/:teamId/alerts',
  authenticateUser,
  [
    param('teamId').isUUID().withMessage('Invalid team ID'),
    query('hours').optional().isInt({ min: 1, max: 168 }).withMessage('Hours must be between 1 and 168'),
  ],
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const { hours = 72 } = req.query;
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

      const alerts = await alertService.getActiveAlerts(teamId, parseInt(hours));

      res.json({
        success: true,
        data: alerts
      });

    } catch (error) {
      console.error('Get alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/teams/{teamId}/alerts/evaluate:
 *   post:
 *     summary: Evaluate alert rules against current team data
 *     tags: [Analytics & Insights]
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
 *     responses:
 *       200:
 *         description: Alert evaluation completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     alerts:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AlertRule'
 *                     teamData:
 *                       $ref: '#/components/schemas/CheckInAnalytics'
 *                     evaluatedAt:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can evaluate alerts
 */
router.post('/:teamId/alerts/evaluate',
  authenticateUser,
  [
    param('teamId').isUUID().withMessage('Invalid team ID'),
  ],
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const userId = req.user.id;

      // Check if user is a manager
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
          message: 'Only managers can evaluate alerts'
        });
      }

      // Get current team analytics for the last 7 days
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: checkIns, error: checkInsError } = await supabase
        .from('check_ins')
        .select('*')
        .eq('team_id', teamId)
        .gte('created_at', fromDate);

      if (checkInsError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch team data'
        });
      }

      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId);

      if (teamMembersError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch team members'
        });
      }

      // Calculate current analytics
      const teamData = calculateAnalytics(checkIns, teamMembers, '7d');

      // Evaluate alerts
      const triggeredAlerts = await alertService.evaluateAlerts(teamId, teamData);

      res.json({
        success: true,
        data: {
          alerts: triggeredAlerts,
          teamData: teamData,
          evaluatedAt: new Date().toISOString()
        },
        message: `${triggeredAlerts.length} alerts triggered`
      });

    } catch (error) {
      console.error('Evaluate alerts error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * @swagger
 * /api/teams/{teamId}/export:
 *   post:
 *     summary: Export team analytics report
 *     tags: [Analytics & Insights]
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
 *               - format
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [csv, json, summary]
 *                 description: Export format (csv, json, or summary)
 *               period:
 *                 type: string
 *                 enum: [7d, 30d, 90d]
 *                 default: 30d
 *                 description: Time period for export
 *               includeCheckIns:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to include individual check-ins data
 *           example:
 *             format: "csv"
 *             period: "7d"
 *             includeCheckIns: true
 *     responses:
 *       200:
 *         description: Report exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     filename:
 *                       type: string
 *                       description: Generated filename
 *                     size:
 *                       type: string
 *                       description: File size (formatted)
 *                     recordCount:
 *                       type: integer
 *                       description: Number of records exported
 *                     exportedAt:
 *                       type: string
 *                       format: date-time
 *                       description: Export timestamp
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Only managers can export reports
 *       404:
 *         description: Team not found 
 */
router.post('/:teamId/export',
  authenticateUser,
  [
    param('teamId').isUUID().withMessage('Invalid team ID'),
    body('format').isIn(['csv', 'json', 'summary']).withMessage('Format must be csv, json, or summary'),
    body('period').optional().isIn(['7d', '30d', '90d']).withMessage('Invalid period'),
    body('includeCheckIns').optional().isBoolean().withMessage('includeCheckIns must be boolean'),
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
      const { format, period = '30d', includeCheckIns = true } = req.body;
      const userId = req.user.id;

      // Check if user is a manager
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
          message: 'Only managers can export reports'
        });
      }

      // Get team info
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('name')
        .eq('id', teamId)
        .single();

      if (teamError) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Get data for export
      const periodHours = {
        '7d': 24 * 7,
        '30d': 24 * 30,
        '90d': 24 * 90
      };

      const hoursAgo = periodHours[period];
      const fromDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

      // Fetch team data
      const [checkInsResult, teamMembersResult, insightsResult] = await Promise.all([
        includeCheckIns ? supabase
          .from('check_ins')
          .select(`
            *,
            profiles:user_id (
              full_name
            )
          `)
          .eq('team_id', teamId)
          .gte('created_at', fromDate)
          .order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),

        supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', teamId),

        supabase
          .from('team_insights')
          .select('*')
          .eq('team_id', teamId)
          .gte('generated_at', fromDate)
          .order('generated_at', { ascending: false })
      ]);

      const checkIns = checkInsResult.data || [];
      const teamMembers = teamMembersResult.data || [];
      const insights = insightsResult.data || [];

      // Calculate analytics
      const teamData = calculateAnalytics(checkIns, teamMembers, period);

      // Export based on format
      let exportResult;
      const options = {
        teamName: team.name,
        period,
        includeCheckIns
      };

      switch (format) {
        case 'csv':
          exportResult = await exportService.exportToCSV(teamData, checkIns, options);
          break;
        case 'json':
          exportResult = await exportService.exportToJSON(teamData, checkIns, insights, options);
          break;
        case 'summary':
          const alertStats = await alertService.getAlertStatistics(teamId, 30);
          exportResult = await exportService.generateExecutiveSummary(teamData, insights, alertStats, options);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid export format'
          });
      }

      res.json({
        success: true,
        data: {
          filename: exportResult.filename,
          size: exportService.formatFileSize(exportResult.size),
          recordCount: exportResult.recordCount || 0,
          exportedAt: new Date().toISOString()
        },
        message: 'Report exported successfully'
      });

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

module.exports = router;