const supabase = require('../../config/supabase');
const pubsubService = require('./pubsubService');

class RealtimeService {
  constructor() {
    this.activeChannels = new Map();
    this.presenceChannels = new Map();
    this.connectionStatus = 'disconnected';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = null;

    // Initialize Supabase realtime connection
    this.initializeRealtime();
  }

  /**
   * Initialize Supabase realtime connection with event handlers
   */
  initializeRealtime() {
    try {
      // Note: Supabase realtime is initialized automatically
      // We'll manage connection status through individual channels
      this.connectionStatus = 'connected';
      console.log('🔌 Supabase realtime service initialized');
    } catch (error) {
      console.error('Failed to initialize Supabase realtime:', error);
      this.connectionStatus = 'error';
    }
  }

  /**
   * Handle connection reconnection with exponential backoff
   */
  handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('🔌 Max reconnection attempts reached');
      return;
    }

    if (this.reconnectInterval) {
      return; // Already attempting to reconnect
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`🔌 Attempting reconnection in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectInterval = setTimeout(() => {
      this.reconnectAttempts++;
      this.clearReconnectInterval();
      this.initializeRealtime();
    }, delay);
  }

  /**
   * Clear reconnection interval
   */
  clearReconnectInterval() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  /**
   * Subscribe to real-time check-ins for a team
   * @param {string} teamId - Team ID
   * @param {Function} callback - Callback function for check-in events
   * @returns {Object} Subscription object
   */
  subscribeToTeamCheckIns(teamId, callback) {
    try {
      const channelName = `team_${teamId}_checkins`;

      // Check if already subscribed
      if (this.activeChannels.has(channelName)) {
        console.log(`📡 Already subscribed to ${channelName}`);
        return this.activeChannels.get(channelName);
      }

      // Create Supabase realtime channel
      const channel = supabase
        .channel(channelName)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'check_ins',
          filter: `team_id=eq.${teamId}`
        }, (payload) => {
          console.log(`📡 Real-time check-in received for team ${teamId}:`, payload);

          // Enhance payload with user profile data
          this.enrichCheckInPayload(payload)
            .then(enrichedPayload => {
              callback({
                type: 'checkin_created',
                team_id: teamId,
                data: enrichedPayload,
                timestamp: new Date().toISOString()
              });

              // Also publish to Redis for broader distribution
              pubsubService.publishCheckInEvent(teamId, enrichedPayload.new, enrichedPayload.new.user_id);
            })
            .catch(error => {
              console.error('Error enriching check-in payload:', error);
              callback({
                type: 'checkin_created',
                team_id: teamId,
                data: payload,
                timestamp: new Date().toISOString()
              });
            });
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'check_ins',
          filter: `team_id=eq.${teamId}`
        }, (payload) => {
          console.log(`📡 Real-time check-in updated for team ${teamId}:`, payload);
          callback({
            type: 'checkin_updated',
            team_id: teamId,
            data: payload,
            timestamp: new Date().toISOString()
          });
        })
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'check_ins',
          filter: `team_id=eq.${teamId}`
        }, (payload) => {
          console.log(`📡 Real-time check-in deleted for team ${teamId}:`, payload);
          callback({
            type: 'checkin_deleted',
            team_id: teamId,
            data: payload,
            timestamp: new Date().toISOString()
          });
        })
        .subscribe((status) => {
          console.log(`📡 Team check-ins subscription status for ${teamId}:`, status);
        });

      // Store active channel
      this.activeChannels.set(channelName, {
        channel,
        teamId,
        type: 'team_checkins',
        callback,
        subscribedAt: new Date().toISOString()
      });

      console.log(`📡 Subscribed to real-time check-ins for team ${teamId}`);
      return channel;
    } catch (error) {
      console.error(`Error subscribing to team check-ins for ${teamId}:`, error);
      return null;
    }
  }

  /**
   * Subscribe to real-time team insights
   * @param {string} teamId - Team ID
   * @param {Function} callback - Callback function for insight events
   * @returns {Object} Subscription object
   */
  subscribeToTeamInsights(teamId, callback) {
    try {
      const channelName = `team_${teamId}_insights`;

      if (this.activeChannels.has(channelName)) {
        console.log(`📡 Already subscribed to ${channelName}`);
        return this.activeChannels.get(channelName);
      }

      const channel = supabase
        .channel(channelName)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'team_insights',
          filter: `team_id=eq.${teamId}`
        }, (payload) => {
          console.log(`📡 Real-time insight received for team ${teamId}:`, payload);
          callback({
            type: 'insight_created',
            team_id: teamId,
            data: payload,
            timestamp: new Date().toISOString()
          });

          // Publish to Redis for broader distribution
          if (payload.new) {
            pubsubService.publishInsightEvent(teamId, payload.new, null);
          }
        })
        .subscribe((status) => {
          console.log(`📡 Team insights subscription status for ${teamId}:`, status);
        });

      this.activeChannels.set(channelName, {
        channel,
        teamId,
        type: 'team_insights',
        callback,
        subscribedAt: new Date().toISOString()
      });

      console.log(`📡 Subscribed to real-time insights for team ${teamId}`);
      return channel;
    } catch (error) {
      console.error(`Error subscribing to team insights for ${teamId}:`, error);
      return null;
    }
  }

  /**
   * Subscribe to team presence (active users)
   * @param {string} teamId - Team ID
   * @param {string} userId - User ID
   * @param {Object} userInfo - User information
   * @param {Function} callback - Callback for presence changes
   * @returns {Object} Presence channel
   */
  subscribeToTeamPresence(teamId, userId, userInfo, callback) {
    try {
      const channelName = `presence_team_${teamId}`;

      // Create or get existing presence channel
      let presenceChannel = this.presenceChannels.get(channelName);

      if (!presenceChannel) {
        presenceChannel = supabase
          .channel(channelName, {
            config: {
              presence: {
                key: userId,
              },
            },
          })
          .on('presence', { event: 'sync' }, () => {
            const presenceState = presenceChannel.presenceState();
            console.log(`📡 Presence sync for team ${teamId}:`, presenceState);

            const activeUsers = this.formatPresenceData(presenceState);
            callback({
              type: 'presence_sync',
              team_id: teamId,
              active_users: activeUsers,
              count: activeUsers.length,
              timestamp: new Date().toISOString()
            });
          })
          .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log(`📡 User joined team ${teamId}:`, key, newPresences);
            callback({
              type: 'user_joined',
              team_id: teamId,
              user_id: key,
              user_info: newPresences[0],
              timestamp: new Date().toISOString()
            });
          })
          .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log(`📡 User left team ${teamId}:`, key, leftPresences);
            callback({
              type: 'user_left',
              team_id: teamId,
              user_id: key,
              user_info: leftPresences[0],
              timestamp: new Date().toISOString()
            });
          })
          .subscribe(async (status) => {
            console.log(`📡 Presence subscription status for team ${teamId}:`, status);

            if (status === 'SUBSCRIBED') {
              // Track user presence
              await presenceChannel.track({
                user_id: userId,
                full_name: userInfo.full_name,
                avatar_url: userInfo.avatar_url,
                online_at: new Date().toISOString(),
                last_seen: new Date().toISOString()
              });
            }
          });

        this.presenceChannels.set(channelName, presenceChannel);
      }

      console.log(`📡 Subscribed to presence for team ${teamId}, user ${userId}`);
      return presenceChannel;
    } catch (error) {
      console.error(`Error subscribing to team presence for ${teamId}:`, error);
      return null;
    }
  }

  /**
   * Subscribe to live dashboard analytics
   * @param {string} teamId - Team ID
   * @param {Function} callback - Callback for analytics updates
   * @returns {Object} Subscription object
   */
  subscribeToLiveDashboard(teamId, callback) {
    try {
      const channelName = `dashboard_${teamId}`;

      if (this.activeChannels.has(channelName)) {
        return this.activeChannels.get(channelName);
      }

      // Subscribe to multiple tables that affect dashboard analytics
      const channel = supabase
        .channel(channelName)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'check_ins',
          filter: `team_id=eq.${teamId}`
        }, (payload) => {
          callback({
            type: 'analytics_update',
            source: 'check_ins',
            team_id: teamId,
            event: payload.eventType,
            data: payload,
            timestamp: new Date().toISOString()
          });
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'team_insights',
          filter: `team_id=eq.${teamId}`
        }, (payload) => {
          callback({
            type: 'analytics_update',
            source: 'insights',
            team_id: teamId,
            event: payload.eventType,
            data: payload,
            timestamp: new Date().toISOString()
          });
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'team_members',
          filter: `team_id=eq.${teamId}`
        }, (payload) => {
          callback({
            type: 'team_update',
            source: 'members',
            team_id: teamId,
            event: payload.eventType,
            data: payload,
            timestamp: new Date().toISOString()
          });
        })
        .subscribe((status) => {
          console.log(`📡 Live dashboard subscription status for ${teamId}:`, status);
        });

      this.activeChannels.set(channelName, {
        channel,
        teamId,
        type: 'live_dashboard',
        callback,
        subscribedAt: new Date().toISOString()
      });

      console.log(`📡 Subscribed to live dashboard for team ${teamId}`);
      return channel;
    } catch (error) {
      console.error(`Error subscribing to live dashboard for ${teamId}:`, error);
      return null;
    }
  }

  /**
   * Enrich check-in payload with user profile data
   * @param {Object} payload - Raw check-in payload
   * @returns {Promise<Object>} Enriched payload
   */
  async enrichCheckInPayload(payload) {
    try {
      if (!payload.new || !payload.new.user_id || payload.new.is_anonymous) {
        return payload;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', payload.new.user_id)
        .single();

      if (profile) {
        payload.new.profiles = profile;
      }

      return payload;
    } catch (error) {
      console.error('Error enriching check-in payload:', error);
      return payload;
    }
  }

  /**
   * Format presence data for easier consumption
   * @param {Object} presenceState - Raw presence state
   * @returns {Array} Formatted active users
   */
  formatPresenceData(presenceState) {
    const activeUsers = [];

    Object.entries(presenceState).forEach(([userId, presences]) => {
      if (presences && presences.length > 0) {
        const presence = presences[0];
        activeUsers.push({
          user_id: userId,
          full_name: presence.full_name,
          avatar_url: presence.avatar_url,
          online_at: presence.online_at,
          last_seen: presence.last_seen
        });
      }
    });

    return activeUsers.sort((a, b) => new Date(b.online_at) - new Date(a.online_at));
  }

  /**
   * Unsubscribe from a channel
   * @param {string} channelName - Channel name
   * @returns {boolean} Success status
   */
  unsubscribe(channelName) {
    try {
      const subscription = this.activeChannels.get(channelName);
      if (subscription) {
        subscription.channel.unsubscribe();
        this.activeChannels.delete(channelName);
        console.log(`📡 Unsubscribed from ${channelName}`);
        return true;
      }

      const presenceChannel = this.presenceChannels.get(channelName);
      if (presenceChannel) {
        presenceChannel.unsubscribe();
        this.presenceChannels.delete(channelName);
        console.log(`📡 Unsubscribed from presence channel ${channelName}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error unsubscribing from ${channelName}:`, error);
      return false;
    }
  }

  /**
   * Unsubscribe from all team channels
   * @param {string} teamId - Team ID
   */
  unsubscribeFromTeam(teamId) {
    const channelsToRemove = [];

    // Find all channels for this team
    this.activeChannels.forEach((subscription, channelName) => {
      if (subscription.teamId === teamId) {
        channelsToRemove.push(channelName);
      }
    });

    // Unsubscribe from each channel
    channelsToRemove.forEach(channelName => {
      this.unsubscribe(channelName);
    });

    // Also check presence channels
    const presenceChannelName = `presence_team_${teamId}`;
    if (this.presenceChannels.has(presenceChannelName)) {
      this.unsubscribe(presenceChannelName);
    }

    console.log(`📡 Unsubscribed from all channels for team ${teamId}`);
  }

  /**
   * Get connection status
   * @returns {Object} Connection status and stats
   */
  getStatus() {
    return {
      connection_status: this.connectionStatus,
      reconnect_attempts: this.reconnectAttempts,
      active_channels: this.activeChannels.size,
      presence_channels: this.presenceChannels.size,
      channels: Array.from(this.activeChannels.keys()),
      presence_channels_list: Array.from(this.presenceChannels.keys())
    };
  }

  /**
   * Get active subscriptions
   * @returns {Object} Active subscriptions summary
   */
  getActiveSubscriptions() {
    const subscriptions = {};

    this.activeChannels.forEach((subscription, channelName) => {
      subscriptions[channelName] = {
        team_id: subscription.teamId,
        type: subscription.type,
        subscribed_at: subscription.subscribedAt
      };
    });

    return {
      realtime_status: this.connectionStatus,
      subscriptions,
      total_subscriptions: this.activeChannels.size,
      presence_channels: this.presenceChannels.size
    };
  }

  /**
   * Clean up all subscriptions
   */
  cleanup() {
    console.log('📡 Cleaning up all realtime subscriptions...');

    // Unsubscribe from all active channels
    this.activeChannels.forEach((subscription, channelName) => {
      try {
        subscription.channel.unsubscribe();
      } catch (error) {
        console.error(`Error unsubscribing from ${channelName}:`, error);
      }
    });
    this.activeChannels.clear();

    // Unsubscribe from all presence channels
    this.presenceChannels.forEach((channel, channelName) => {
      try {
        channel.unsubscribe();
      } catch (error) {
        console.error(`Error unsubscribing from presence ${channelName}:`, error);
      }
    });
    this.presenceChannels.clear();

    // Clear reconnection timer
    this.clearReconnectInterval();

    console.log('✅ All realtime subscriptions cleaned up');
  }
}

module.exports = new RealtimeService();
