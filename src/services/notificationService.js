const supabase = require('../../config/supabase');
const { publishMessage } = require('../../config/redis');

class NotificationService {
  constructor() {
    this.emailEnabled = process.env.EMAIL_ENABLED === 'true';
    this.slackEnabled = process.env.SLACK_WEBHOOK_URL ? true : false;
    this.pushEnabled = process.env.PUSH_NOTIFICATIONS_ENABLED === 'true';
  }

  /**
   * Send notification for triggered alert
   * @param {string} teamId - Team ID
   * @param {Object} alert - Alert object
   * @param {Array} recipients - List of users to notify
   * @returns {Promise<Object>} Notification result
   */
  async sendAlertNotification(teamId, alert, recipients = []) {
    try {
      const notifications = [];
      const results = {
        sent: 0,
        failed: 0,
        methods: [],
        errors: []
      };

      // Get team information
      const { data: team } = await supabase
        .from('teams')
        .select('name')
        .eq('id', teamId)
        .single();

      const teamName = team?.name || 'Unknown Team';

      // Get team managers if no specific recipients provided
      if (recipients.length === 0) {
        const { data: managers } = await supabase
          .from('team_members')
          .select(`
            user_id,
            profiles:user_id (
              full_name,
              email,
              notification_preferences
            )
          `)
          .eq('team_id', teamId)
          .eq('role', 'manager');

        recipients = managers || [];
      }

      // Create notification message
      const notificationData = {
        type: 'team_alert',
        alert_id: alert.id,
        team_id: teamId,
        team_name: teamName,
        title: alert.title,
        content: alert.content,
        severity: alert.severity,
        priority: alert.metadata?.priority || 5,
        triggered_at: alert.generated_at,
        metrics: alert.metadata?.team_metrics || {}
      };

      // Send notifications to each recipient
      for (const recipient of recipients) {
        const userNotifications = await this.sendUserNotification(
          recipient,
          notificationData
        );
        notifications.push(...userNotifications);
      }

      // Process results
      notifications.forEach(notification => {
        if (notification.success) {
          results.sent++;
          if (!results.methods.includes(notification.method)) {
            results.methods.push(notification.method);
          }
        } else {
          results.failed++;
          results.errors.push({
            method: notification.method,
            user_id: notification.user_id,
            error: notification.error
          });
        }
      });

      // Store notification record
      await this.logNotification(teamId, alert.id, results);

      // Publish to Redis for real-time updates
      if (publishMessage) {
        await publishMessage(`team:${teamId}:alerts`, {
          type: 'alert_notification',
          alert,
          notification_results: results,
          timestamp: new Date().toISOString()
        });
      }

      return results;
    } catch (error) {
      console.error('Alert notification error:', error);
      return {
        sent: 0,
        failed: 1,
        methods: [],
        errors: [{ error: error.message }]
      };
    }
  }

  /**
   * Send notification to individual user
   * @param {Object} recipient - User recipient data
   * @param {Object} notificationData - Notification content
   * @returns {Promise<Array>} Array of notification attempts
   */
  async sendUserNotification(recipient, notificationData) {
    const notifications = [];
    const userPrefs = recipient.profiles?.notification_preferences || {};
    const enabledMethods = userPrefs.enabled_methods || ['in_app'];

    // In-app notification (always enabled)
    try {
      await this.sendInAppNotification(recipient.user_id, notificationData);
      notifications.push({
        success: true,
        method: 'in_app',
        user_id: recipient.user_id
      });
    } catch (error) {
      notifications.push({
        success: false,
        method: 'in_app',
        user_id: recipient.user_id,
        error: error.message
      });
    }

    // Email notification
    if (enabledMethods.includes('email') && this.emailEnabled) {
      try {
        await this.sendEmailNotification(recipient, notificationData);
        notifications.push({
          success: true,
          method: 'email',
          user_id: recipient.user_id
        });
      } catch (error) {
        notifications.push({
          success: false,
          method: 'email',
          user_id: recipient.user_id,
          error: error.message
        });
      }
    }

    // Push notification
    if (enabledMethods.includes('push') && this.pushEnabled) {
      try {
        await this.sendPushNotification(recipient, notificationData);
        notifications.push({
          success: true,
          method: 'push',
          user_id: recipient.user_id
        });
      } catch (error) {
        notifications.push({
          success: false,
          method: 'push',
          user_id: recipient.user_id,
          error: error.message
        });
      }
    }

    // Slack notification (if configured for team)
    if (enabledMethods.includes('slack') && this.slackEnabled) {
      try {
        await this.sendSlackNotification(notificationData);
        notifications.push({
          success: true,
          method: 'slack',
          user_id: recipient.user_id
        });
      } catch (error) {
        notifications.push({
          success: false,
          method: 'slack',
          user_id: recipient.user_id,
          error: error.message
        });
      }
    }

    return notifications;
  }

  /**
   * Send in-app notification
   * @param {string} userId - User ID
   * @param {Object} data - Notification data
   */
  async sendInAppNotification(userId, data) {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: data.type,
        title: data.title,
        content: data.content,
        data: {
          alert_id: data.alert_id,
          team_id: data.team_id,
          team_name: data.team_name,
          severity: data.severity,
          priority: data.priority,
          metrics: data.metrics
        },
        read: false
      });

    if (error) {
      throw new Error(`In-app notification failed: ${error.message}`);
    }
  }

  /**
   * Send email notification (placeholder - integrate with email service)
   * @param {Object} recipient - Recipient data
   * @param {Object} data - Notification data
   */
  async sendEmailNotification(recipient, data) {
    // Placeholder for email service integration
    // This would integrate with services like SendGrid, AWS SES, etc.
    const emailData = {
      to: recipient.profiles.email,
      subject: `Team Alert: ${data.title}`,
      html: this.generateEmailTemplate(recipient, data)
    };

    // For now, just log the email that would be sent
    console.log('Email notification (simulated):', {
      to: emailData.to,
      subject: emailData.subject,
      alert_id: data.alert_id
    });

    // In production, implement actual email sending:
    // await emailService.send(emailData);
  }

  /**
   * Send push notification (placeholder)
   * @param {Object} recipient - Recipient data
   * @param {Object} data - Notification data
   */
  async sendPushNotification(recipient, data) {
    // Placeholder for push notification service
    // This would integrate with Firebase Cloud Messaging, Apple Push Notifications, etc.
    console.log('Push notification (simulated):', {
      user_id: recipient.user_id,
      title: data.title,
      body: data.content.substring(0, 100) + '...',
      alert_id: data.alert_id
    });

    // In production, implement actual push notifications:
    // await pushService.send(recipient.push_tokens, data);
  }

  /**
   * Send Slack notification
   * @param {Object} data - Notification data
   */
  async sendSlackNotification(data) {
    if (!process.env.SLACK_WEBHOOK_URL) {
      throw new Error('Slack webhook URL not configured');
    }

    const slackMessage = {
      text: `Team Alert: ${data.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 ${data.title}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Team:* ${data.team_name}\n*Severity:* ${data.severity.toUpperCase()}\n*Priority:* ${data.priority}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'plain_text',
            text: data.content
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Triggered at ${new Date(data.triggered_at).toLocaleString()}`
            }
          ]
        }
      ]
    };

    // For now, just log the Slack message that would be sent
    console.log('Slack notification (simulated):', {
      webhook_url: process.env.SLACK_WEBHOOK_URL,
      message: slackMessage
    });

    // In production, implement actual Slack webhook:
    // await fetch(process.env.SLACK_WEBHOOK_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(slackMessage)
    // });
  }

  /**
   * Generate email template for alert notification
   * @param {Object} recipient - Recipient data
   * @param {Object} data - Notification data
   * @returns {string} HTML email template
   */
  generateEmailTemplate(recipient, data) {
    const severityColor = {
      critical: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8'
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Team Alert Notification</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="background-color: ${severityColor[data.severity] || '#17a2b8'}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🚨 Team Alert</h1>
            <p style="margin: 5px 0 0 0; font-size: 16px;">${data.team_name}</p>
          </div>

          <div style="padding: 30px;">
            <h2 style="color: #333; margin-top: 0;">${data.title}</h2>

            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Severity:</strong> <span style="color: ${severityColor[data.severity]}; text-transform: uppercase; font-weight: bold;">${data.severity}</span></p>
              <p style="margin: 5px 0 0 0;"><strong>Priority:</strong> ${data.priority}</p>
              <p style="margin: 5px 0 0 0;"><strong>Triggered:</strong> ${new Date(data.triggered_at).toLocaleString()}</p>
            </div>

            <div style="margin: 20px 0;">
              <h3 style="color: #333;">Alert Details</h3>
              <p style="color: #666; line-height: 1.6;">${data.content}</p>
            </div>

            ${data.metrics ? `
            <div style="margin: 20px 0;">
              <h3 style="color: #333;">Team Metrics</h3>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: #333;">${data.metrics.avg_mood || 'N/A'}</div>
                  <div style="font-size: 12px; color: #666;">Avg Mood</div>
                </div>
                <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: #333;">${data.metrics.avg_energy || 'N/A'}</div>
                  <div style="font-size: 12px; color: #666;">Avg Energy</div>
                </div>
                <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; color: #333;">${Math.round((data.metrics.participation_rate || 0) * 100)}%</div>
                  <div style="font-size: 12px; color: #666;">Participation</div>
                </div>
              </div>
            </div>
            ` : ''}

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                This alert was automatically generated by the Team Pulse Analytics System.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Log notification in database for audit trail
   * @param {string} teamId - Team ID
   * @param {string} alertId - Alert ID
   * @param {Object} results - Notification results
   */
  async logNotification(teamId, alertId, results) {
    try {
      await supabase
        .from('notification_logs')
        .insert({
          team_id: teamId,
          alert_id: alertId,
          sent_count: results.sent,
          failed_count: results.failed,
          methods_used: results.methods,
          errors: results.errors.length > 0 ? results.errors : null,
          sent_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to log notification:', error);
      // Don't throw - logging failure shouldn't break notification
    }
  }

  /**
   * Get notification preferences for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User notification preferences
   */
  async getUserNotificationPreferences(userId) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', userId)
        .single();

      return profile?.notification_preferences || {
        enabled_methods: ['in_app'],
        alert_types: ['critical', 'warning'],
        quiet_hours: { enabled: false }
      };
    } catch (error) {
      console.error('Failed to get notification preferences:', error);
      return {
        enabled_methods: ['in_app'],
        alert_types: ['critical', 'warning'],
        quiet_hours: { enabled: false }
      };
    }
  }

  /**
   * Update user notification preferences
   * @param {string} userId - User ID
   * @param {Object} preferences - New preferences
   * @returns {Promise<Object>} Updated preferences
   */
  async updateUserNotificationPreferences(userId, preferences) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ notification_preferences: preferences })
      .eq('id', userId)
      .select('notification_preferences')
      .single();

    if (error) {
      throw new Error(`Failed to update notification preferences: ${error.message}`);
    }

    return data.notification_preferences;
  }

  /**
   * Send test notification to verify configuration
   * @param {string} userId - User ID to send test to
   * @param {string} method - Notification method to test
   * @returns {Promise<boolean>} Success status
   */
  async sendTestNotification(userId, method = 'in_app') {
    const testData = {
      type: 'test_notification',
      alert_id: 'test',
      team_id: 'test',
      team_name: 'Test Team',
      title: 'Test Notification',
      content: 'This is a test notification to verify your notification settings are working correctly.',
      severity: 'info',
      priority: 5,
      triggered_at: new Date().toISOString(),
      metrics: {}
    };

    try {
      switch (method) {
        case 'in_app':
          await this.sendInAppNotification(userId, testData);
          break;
        case 'email':
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', userId)
            .single();
          await this.sendEmailNotification({ user_id: userId, profiles: profile }, testData);
          break;
        case 'push':
          await this.sendPushNotification({ user_id: userId }, testData);
          break;
        case 'slack':
          await this.sendSlackNotification(testData);
          break;
        default:
          throw new Error(`Unknown notification method: ${method}`);
      }
      return true;
    } catch (error) {
      console.error(`Test notification failed for method ${method}:`, error);
      return false;
    }
  }
}

module.exports = new NotificationService();

