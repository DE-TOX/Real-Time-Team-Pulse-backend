const { publishEvent, subscribeToChannel } = require('../../config/redis');
const supabase = require('../../config/supabase');

class PubSubService {
  constructor() {
    this.activeSubscriptions = new Map();
    this.channelPatterns = {
      TEAM_ACTIVITY: 'team:{teamId}:activity',
      TEAM_CHECKINS: 'team:{teamId}:checkins',
      TEAM_ALERTS: 'team:{teamId}:alerts',
      TEAM_INSIGHTS: 'team:{teamId}:insights',
      USER_NOTIFICATIONS: 'user:{userId}:notifications',
      GLOBAL_ACTIVITY: 'global:activity'
    };
  }

  /**
   * Get channel name from pattern
   */
  getChannelName(pattern, params = {}) {
    let channel = this.channelPatterns[pattern];
    if (!channel) throw new Error(`Unknown channel pattern: ${pattern}`);

    // Replace placeholders with actual values
    Object.entries(params).forEach(([key, value]) => {
      channel = channel.replace(`{${key}}`, value);
    });

    return channel;
  }

  /**
   * Publish team activity event
   */
  async publishTeamActivity(teamId, activityType, data, userId = null) {
    try {
      const channel = this.getChannelName('TEAM_ACTIVITY', { teamId });

      // Get user info if userId provided
      let user = null;
      if (userId) {
        const { data: userData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', userId)
          .single();
        user = userData;
      }

      const eventData = {
        type: 'team_activity',
        activity_type: activityType,
        team_id: teamId,
        user,
        data,
        timestamp: new Date().toISOString()
      };

      const success = await publishEvent(channel, eventData);

      // Also publish to global activity feed
      await publishEvent(
        this.getChannelName('GLOBAL_ACTIVITY'),
        { ...eventData, channel }
      );

      return success;
    } catch (error) {
      console.error('Error publishing team activity:', error);
      return false;
    }
  }

  /**
   * Publish check-in event
   */
  async publishCheckInEvent(teamId, checkInData, userId) {
    try {
      const channel = this.getChannelName('TEAM_CHECKINS', { teamId });

      // Get user info (unless anonymous)
      let user = null;
      if (!checkInData.is_anonymous && userId) {
        const { data: userData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', userId)
          .single();
        user = userData;
      }

      const eventData = {
        type: 'checkin_submitted',
        team_id: teamId,
        user: checkInData.is_anonymous ? null : user,
        checkin: {
          id: checkInData.id,
          mood_score: checkInData.mood_score,
          energy_level: checkInData.energy_level,
          sentiment_label: checkInData.sentiment_label,
          is_anonymous: checkInData.is_anonymous,
          created_at: checkInData.created_at
        },
        timestamp: new Date().toISOString()
      };

      const success = await publishEvent(channel, eventData);

      // Publish team activity
      await this.publishTeamActivity(
        teamId,
        'checkin_submitted',
        {
          mood_score: checkInData.mood_score,
          energy_level: checkInData.energy_level,
          sentiment: checkInData.sentiment_label
        },
        checkInData.is_anonymous ? null : userId
      );

      return success;
    } catch (error) {
      console.error('Error publishing check-in event:', error);
      return false;
    }
  }

  /**
   * Publish alert event
   */
  async publishAlertEvent(teamId, alertData) {
    try {
      const channel = this.getChannelName('TEAM_ALERTS', { teamId });

      const eventData = {
        type: 'alert_triggered',
        team_id: teamId,
        alert: {
          id: alertData.id,
          title: alertData.title,
          severity: alertData.severity,
          priority: alertData.metadata?.priority || 5,
          triggered_at: alertData.generated_at
        },
        timestamp: new Date().toISOString()
      };

      const success = await publishEvent(channel, eventData);

      // Publish team activity
      await this.publishTeamActivity(
        teamId,
        'alert_triggered',
        {
          severity: alertData.severity,
          title: alertData.title
        }
      );

      return success;
    } catch (error) {
      console.error('Error publishing alert event:', error);
      return false;
    }
  }

  /**
   * Publish insight generation event
   */
  async publishInsightEvent(teamId, insightData, userId) {
    try {
      const channel = this.getChannelName('TEAM_INSIGHTS', { teamId });

      // Get user info
      let user = null;
      if (userId) {
        const { data: userData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', userId)
          .single();
        user = userData;
      }

      const eventData = {
        type: 'insight_generated',
        team_id: teamId,
        user,
        insight: {
          id: insightData.id,
          title: insightData.title,
          insight_type: insightData.insight_type,
          generated_at: insightData.generated_at
        },
        timestamp: new Date().toISOString()
      };

      const success = await publishEvent(channel, eventData);

      // Publish team activity
      await this.publishTeamActivity(
        teamId,
        'insight_generated',
        {
          type: insightData.insight_type,
          title: insightData.title
        },
        userId
      );

      return success;
    } catch (error) {
      console.error('Error publishing insight event:', error);
      return false;
    }
  }

  /**
   * Publish user notification
   */
  async publishUserNotification(userId, notificationData) {
    try {
      const channel = this.getChannelName('USER_NOTIFICATIONS', { userId });

      const eventData = {
        type: 'user_notification',
        user_id: userId,
        notification: notificationData,
        timestamp: new Date().toISOString()
      };

      return await publishEvent(channel, eventData);
    } catch (error) {
      console.error('Error publishing user notification:', error);
      return false;
    }
  }

  /**
   * Subscribe to team activity channel
   */
  subscribeToTeamActivity(teamId, callback) {
    const channel = this.getChannelName('TEAM_ACTIVITY', { teamId });
    const subscription = subscribeToChannel(channel, callback);

    if (subscription) {
      this.activeSubscriptions.set(`team_activity_${teamId}`, {
        channel,
        subscription,
        type: 'team_activity',
        teamId
      });
    }

    return subscription;
  }

  /**
   * Subscribe to team check-ins
   */
  subscribeToTeamCheckIns(teamId, callback) {
    const channel = this.getChannelName('TEAM_CHECKINS', { teamId });
    const subscription = subscribeToChannel(channel, callback);

    if (subscription) {
      this.activeSubscriptions.set(`team_checkins_${teamId}`, {
        channel,
        subscription,
        type: 'team_checkins',
        teamId
      });
    }

    return subscription;
  }

  /**
   * Subscribe to team alerts
   */
  subscribeToTeamAlerts(teamId, callback) {
    const channel = this.getChannelName('TEAM_ALERTS', { teamId });
    const subscription = subscribeToChannel(channel, callback);

    if (subscription) {
      this.activeSubscriptions.set(`team_alerts_${teamId}`, {
        channel,
        subscription,
        type: 'team_alerts',
        teamId
      });
    }

    return subscription;
  }

  /**
   * Subscribe to user notifications
   */
  subscribeToUserNotifications(userId, callback) {
    const channel = this.getChannelName('USER_NOTIFICATIONS', { userId });
    const subscription = subscribeToChannel(channel, callback);

    if (subscription) {
      this.activeSubscriptions.set(`user_notifications_${userId}`, {
        channel,
        subscription,
        type: 'user_notifications',
        userId
      });
    }

    return subscription;
  }

  /**
   * Subscribe to global activity feed
   */
  subscribeToGlobalActivity(callback) {
    const channel = this.getChannelName('GLOBAL_ACTIVITY');
    const subscription = subscribeToChannel(channel, callback);

    if (subscription) {
      this.activeSubscriptions.set('global_activity', {
        channel,
        subscription,
        type: 'global_activity'
      });
    }

    return subscription;
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(subscriptionKey) {
    const subscription = this.activeSubscriptions.get(subscriptionKey);
    if (subscription && subscription.subscription) {
      subscription.subscription.unsubscribe(subscription.channel);
      this.activeSubscriptions.delete(subscriptionKey);
      console.log(`🔌 Unsubscribed from ${subscription.channel}`);
      return true;
    }
    return false;
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions() {
    const subscriptions = {};
    this.activeSubscriptions.forEach((sub, key) => {
      subscriptions[key] = {
        channel: sub.channel,
        type: sub.type,
        teamId: sub.teamId || null,
        userId: sub.userId || null
      };
    });
    return subscriptions;
  }

  /**
   * Clean up all subscriptions
   */
  cleanup() {
    this.activeSubscriptions.forEach((sub, key) => {
      this.unsubscribe(key);
    });
    console.log('✅ All pub/sub subscriptions cleaned up');
  }
}

module.exports = new PubSubService();