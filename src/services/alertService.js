const supabase = require('../../config/supabase');
const insightsService = require('./insightsService');
const notificationService = require('./notificationService');

class AlertService {
  constructor() {
    this.alertRules = [
      {
        name: 'critical_mood_drop',
        condition: (data) => data.average_mood < 2.0,
        severity: 'critical',
        title: 'Critical: Team Mood Alert',
        message: 'Team mood has dropped critically low. Immediate intervention required.',
        cooldown: 24 * 60 * 60 * 1000, // 24 hours
        priority: 1
      },
      {
        name: 'sentiment_decline',
        condition: (data) => data.average_sentiment < -0.3 && this.hasNegativeTrend(data.sentiment_trend),
        severity: 'warning',
        title: 'Warning: Declining Team Sentiment',
        message: 'Team sentiment is declining and showing negative patterns.',
        cooldown: 12 * 60 * 60 * 1000, // 12 hours
        priority: 2
      },
      {
        name: 'low_participation',
        condition: (data) => data.participation_rate < 0.4,
        severity: 'warning',
        title: 'Warning: Low Team Engagement',
        message: 'Less than 40% of team members are participating in check-ins.',
        cooldown: 48 * 60 * 60 * 1000, // 48 hours
        priority: 3
      },
      {
        name: 'burnout_risk',
        condition: (data) => data.average_mood < 2.5 && data.average_energy < 2.5,
        severity: 'critical',
        title: 'Critical: Burnout Risk Detected',
        message: 'Multiple indicators suggest high burnout risk across the team.',
        cooldown: 24 * 60 * 60 * 1000, // 24 hours
        priority: 1
      },
      {
        name: 'energy_decline',
        condition: (data) => data.average_energy < 2.0,
        severity: 'warning',
        title: 'Warning: Low Team Energy',
        message: 'Team energy levels are critically low, indicating potential workload issues.',
        cooldown: 24 * 60 * 60 * 1000, // 24 hours
        priority: 2
      },
      {
        name: 'positive_trend',
        condition: (data) => data.average_mood > 4.5 && data.average_sentiment > 0.5,
        severity: 'info',
        title: 'Info: Excellent Team Performance',
        message: 'Team is performing exceptionally well with high morale and positive sentiment.',
        cooldown: 7 * 24 * 60 * 60 * 1000, // 7 days
        priority: 4
      },
      {
        name: 'mood_improvement',
        condition: (data) => this.hasPositiveMoodTrend(data.sentiment_trend) && data.average_mood > 3.5,
        severity: 'info',
        title: 'Info: Team Mood Improving',
        message: 'Positive trend detected in team mood and sentiment over recent periods.',
        cooldown: 5 * 24 * 60 * 60 * 1000, // 5 days
        priority: 4
      }
    ];
  }

  /**
   * Evaluate all alert rules against team data
   * @param {string} teamId - Team ID
   * @param {Object} teamData - Team analytics data
   * @returns {Promise<Array>} Array of triggered alerts
   */
  async evaluateAlerts(teamId, teamData) {
    try {
      const triggeredAlerts = [];

      for (const rule of this.alertRules) {
        try {
          // Check if rule condition is met
          if (rule.condition(teamData)) {
            // Check if alert is on cooldown
            const isOnCooldown = await this.isAlertOnCooldown(teamId, rule.name, rule.cooldown);

            if (!isOnCooldown) {
              const alert = await this.createAlert(teamId, rule, teamData);
              triggeredAlerts.push(alert);
            }
          }
        } catch (error) {
          console.error(`Error evaluating rule ${rule.name}:`, error);
        }
      }

      // Sort by priority (lower number = higher priority)
      triggeredAlerts.sort((a, b) => a.priority - b.priority);

      return triggeredAlerts;
    } catch (error) {
      console.error('Alert evaluation error:', error);
      return [];
    }
  }

  /**
   * Create and store an alert
   * @param {string} teamId - Team ID
   * @param {Object} rule - Alert rule
   * @param {Object} teamData - Team analytics data
   * @returns {Promise<Object>} Created alert
   */
  async createAlert(teamId, rule, teamData) {
    try {
      // Generate detailed insight for the alert
      const insight = await insightsService.generateTeamInsight(teamData, 'alert');

      const alertData = {
        team_id: teamId,
        insight_type: 'alert',
        title: rule.title,
        content: `${rule.message}\n\n${insight.content}`,
        severity: rule.severity,
        metadata: {
          rule_name: rule.name,
          triggered_at: new Date().toISOString(),
          team_metrics: {
            avg_mood: teamData.average_mood,
            avg_energy: teamData.average_energy,
            avg_sentiment: teamData.average_sentiment,
            participation_rate: teamData.participation_rate,
            total_checkins: teamData.total_checkins
          },
          priority: rule.priority,
          cooldown_hours: rule.cooldown / (60 * 60 * 1000)
        }
      };

      const { data: alert, error } = await supabase
        .from('team_insights')
        .insert(alertData)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`Alert triggered for team ${teamId}: ${rule.name}`);

      // Send notification for critical and warning alerts
      if (rule.severity === 'critical' || rule.severity === 'warning') {
        try {
          const notificationResult = await notificationService.sendAlertNotification(teamId, alert);
          console.log(`Notification sent for alert ${alert.id}:`, notificationResult);
        } catch (notificationError) {
          console.error(`Failed to send notification for alert ${alert.id}:`, notificationError);
          // Don't fail the alert creation if notification fails
        }
      }

      return { ...alert, priority: rule.priority };
    } catch (error) {
      console.error('Alert creation error:', error);
      throw error;
    }
  }

  /**
   * Check if an alert is on cooldown
   * @param {string} teamId - Team ID
   * @param {string} ruleName - Rule name
   * @param {number} cooldownMs - Cooldown period in milliseconds
   * @returns {Promise<boolean>} True if on cooldown
   */
  async isAlertOnCooldown(teamId, ruleName, cooldownMs) {
    try {
      const cutoffTime = new Date(Date.now() - cooldownMs).toISOString();

      const { data: recentAlert, error } = await supabase
        .from('team_insights')
        .select('generated_at')
        .eq('team_id', teamId)
        .eq('insight_type', 'alert')
        .contains('metadata', { rule_name: ruleName })
        .gte('generated_at', cutoffTime)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return !!recentAlert;
    } catch (error) {
      console.error('Cooldown check error:', error);
      return false;
    }
  }

  /**
   * Check if sentiment trend is negative
   * @param {Array} trendData - Sentiment trend data
   * @returns {boolean} True if trend is negative
   */
  hasNegativeTrend(trendData) {
    if (!trendData || trendData.length < 2) return false;

    // Check last 3 days for negative trend
    const recent = trendData.slice(-3);

    for (let i = 1; i < recent.length; i++) {
      if (recent[i].avg_sentiment > recent[i-1].avg_sentiment) {
        return false; // Found positive change
      }
    }

    return recent.length >= 2; // At least 2 points showing decline
  }

  /**
   * Check if mood trend is positive
   * @param {Array} trendData - Sentiment trend data
   * @returns {boolean} True if trend is positive
   */
  hasPositiveMoodTrend(trendData) {
    if (!trendData || trendData.length < 2) return false;

    // Check last 3 days for positive trend
    const recent = trendData.slice(-3);

    for (let i = 1; i < recent.length; i++) {
      if (recent[i].avg_mood < recent[i-1].avg_mood) {
        return false; // Found negative change
      }
    }

    return recent.length >= 2; // At least 2 points showing improvement
  }

  /**
   * Get active alerts for a team
   * @param {string} teamId - Team ID
   * @param {number} hours - Hours to look back (default 72)
   * @returns {Promise<Array>} Active alerts
   */
  async getActiveAlerts(teamId, hours = 72) {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data: alerts, error } = await supabase
        .from('team_insights')
        .select('*')
        .eq('team_id', teamId)
        .eq('insight_type', 'alert')
        .gte('generated_at', cutoffTime)
        .order('generated_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Add priority from metadata and sort
      return alerts
        .map(alert => ({
          ...alert,
          priority: alert.metadata?.priority || 5
        }))
        .sort((a, b) => a.priority - b.priority);
    } catch (error) {
      console.error('Get active alerts error:', error);
      return [];
    }
  }

  /**
   * Mark alert as acknowledged
   * @param {string} alertId - Alert ID
   * @param {string} userId - User ID who acknowledged
   * @returns {Promise<Object>} Updated alert
   */
  async acknowledgeAlert(alertId, userId) {
    try {
      const { data: alert, error } = await supabase
        .from('team_insights')
        .update({
          metadata: supabase.rpc('jsonb_set', {
            target: 'metadata',
            path: '{acknowledged}',
            new_value: JSON.stringify({
              at: new Date().toISOString(),
              by: userId
            })
          })
        })
        .eq('id', alertId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return alert;
    } catch (error) {
      console.error('Acknowledge alert error:', error);
      throw error;
    }
  }

  /**
   * Get alert statistics for a team
   * @param {string} teamId - Team ID
   * @param {number} days - Days to analyze (default 30)
   * @returns {Promise<Object>} Alert statistics
   */
  async getAlertStatistics(teamId, days = 30) {
    try {
      const cutoffTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: alerts, error } = await supabase
        .from('team_insights')
        .select('severity, metadata, generated_at')
        .eq('team_id', teamId)
        .eq('insight_type', 'alert')
        .gte('generated_at', cutoffTime);

      if (error) {
        throw error;
      }

      const stats = {
        total: alerts.length,
        by_severity: {
          critical: 0,
          warning: 0,
          info: 0
        },
        by_rule: {},
        acknowledged: 0,
        avg_per_week: 0
      };

      alerts.forEach(alert => {
        // Count by severity
        stats.by_severity[alert.severity] = (stats.by_severity[alert.severity] || 0) + 1;

        // Count by rule
        const ruleName = alert.metadata?.rule_name || 'unknown';
        stats.by_rule[ruleName] = (stats.by_rule[ruleName] || 0) + 1;

        // Count acknowledged
        if (alert.metadata?.acknowledged) {
          stats.acknowledged++;
        }
      });

      // Calculate average per week
      stats.avg_per_week = Math.round((stats.total / days) * 7 * 100) / 100;

      return stats;
    } catch (error) {
      console.error('Alert statistics error:', error);
      return {
        total: 0,
        by_severity: { critical: 0, warning: 0, info: 0 },
        by_rule: {},
        acknowledged: 0,
        avg_per_week: 0
      };
    }
  }

  /**
   * Test alert rules against sample data
   * @param {Object} sampleData - Sample team data
   * @returns {Object} Test results
   */
  testAlertRules(sampleData) {
    const results = {};

    this.alertRules.forEach(rule => {
      try {
        results[rule.name] = {
          triggered: rule.condition(sampleData),
          severity: rule.severity,
          title: rule.title,
          priority: rule.priority
        };
      } catch (error) {
        results[rule.name] = {
          triggered: false,
          error: error.message
        };
      }
    });

    return results;
  }
}

module.exports = new AlertService();