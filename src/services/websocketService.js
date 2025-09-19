const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../../config/supabase');
const realtimeService = require('./realtimeService');
const pubsubService = require('./pubsubService');
const { authenticateWebSocket } = require('../../middleware/websokectAuth');

class WebSocketService {
  constructor() {
    this.io = null;
    this.server = null;
    this.rooms = new Map(); // roomId -> room data
    this.userSessions = new Map(); // userId -> { socketId, teamIds, presence }
    this.socketUsers = new Map(); // socketId -> user data
    this.activeStreams = new Map(); // streamId -> stream data
    this.collaborationSessions = new Map(); // sessionId -> collaboration data
    this.heartbeatInterval = null;

    // this.setupEventHandlers(); // Temporarily commented out
  }

  /**
   * Initialize WebSocket server
   * @param {Object} httpServer - HTTP server instance
   * @param {Object} options - Socket.IO options
   */
  initialize(httpServer, options = {}) {
    const defaultOptions = {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
      allowEIO3: true
    };

    this.io = new Server(httpServer, { ...defaultOptions, ...options });
    this.server = httpServer;

    console.log('🔌 WebSocket server initialized');

    // Setup Socket.IO event handlers
    this.io.on('connection', (socket) => {
      console.log(`🔌 Client connected: ${socket.id}`);
      this.handleConnection(socket);
    });

    // Setup heartbeat for connection monitoring
    this.setupHeartbeat();

    return this.io;
  }

  /**
   * Handle new WebSocket connection
   * @param {Object} socket - Socket.IO socket instance
   */
  async handleConnection(socket) {
    // Extract authentication token from handshake
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      console.log(`❌ Unauthenticated connection attempt: ${socket.id}`);
      socket.emit('error', { message: 'Authentication required' });
      socket.disconnect();
      return;
    }

    try {
      // Authenticate user
      const user = await this.authenticateSocket(token);
      if (!user) {
        socket.emit('error', { message: 'Invalid authentication token' });
        socket.disconnect();
        return;
      }

      // Store user session
      this.socketUsers.set(socket.id, {
        ...user,
        socketId: socket.id,
        connectedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      });

      // Update user sessions map
      const existingSession = this.userSessions.get(user.id);
      if (existingSession) {
        // User reconnecting - clean up old socket
        if (existingSession.socketId !== socket.id) {
          const oldSocket = this.io.sockets.sockets.get(existingSession.socketId);
          if (oldSocket) {
            oldSocket.disconnect();
          }
        }
      }

      this.userSessions.set(user.id, {
        socketId: socket.id,
        teamIds: [],
        presence: {},
        lastActivity: new Date().toISOString()
      });

      console.log(`👤 User authenticated: ${user.email} (${socket.id})`);

      // Send authentication success
      socket.emit('authenticated', {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name
        },
        socketId: socket.id,
        connectedAt: new Date().toISOString()
      });

      // Setup socket event handlers
      this.setupSocketHandlers(socket, user);

    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('error', { message: 'Authentication failed' });
      socket.disconnect();
    }
  }

  /**
   * Setup individual socket event handlers
   * @param {Object} socket - Socket.IO socket
   * @param {Object} user - Authenticated user
   */
  setupSocketHandlers(socket, user) {
    // Room management
    socket.on('join_team_room', (data) => this.handleJoinTeamRoom(socket, user, data));
    socket.on('leave_team_room', (data) => this.handleLeaveTeamRoom(socket, user, data));

    // Real-time data streaming
    socket.on('subscribe_analytics', (data) => this.handleSubscribeAnalytics(socket, user, data));
    socket.on('unsubscribe_analytics', (data) => this.handleUnsubscribeAnalytics(socket, user, data));

    // Collaboration features
    socket.on('start_collaboration', (data) => this.handleStartCollaboration(socket, user, data));
    socket.on('collaboration_event', (data) => this.handleCollaborationEvent(socket, user, data));
    socket.on('end_collaboration', (data) => this.handleEndCollaboration(socket, user, data));

    // Presence and activity
    socket.on('update_presence', (data) => this.handleUpdatePresence(socket, user, data));
    socket.on('activity_ping', () => this.handleActivityPing(socket, user));

    // Mobile-specific events
    socket.on('mobile_focus', () => this.handleMobileFocus(socket, user));
    socket.on('mobile_blur', () => this.handleMobileBlur(socket, user));
    socket.on('mobile_reconnect', () => this.handleMobileReconnect(socket, user));

    // Connection events
    socket.on('disconnect', (reason) => this.handleDisconnection(socket, user, reason));
    socket.on('error', (error) => this.handleSocketError(socket, user, error));
  }

  /**
   * Authenticate WebSocket connection
   * @param {string} token - JWT token
   * @returns {Object|null} User data or null
   */
  async authenticateSocket(token) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return null;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      return {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || 'Unknown User',
        avatar_url: profile?.avatar_url,
        role: profile?.role || 'member'
      };
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      return null;
    }
  }

  /**
   * Handle joining team room
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   * @param {Object} data - Join room data
   */
  async handleJoinTeamRoom(socket, user, data) {
    try {
      const { teamId, roomType = 'general' } = data;

      if (!teamId) {
        socket.emit('error', { message: 'Team ID required' });
        return;
      }

      // Verify team membership
      const { data: membership, error } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', user.id)
        .single();

      if (error || !membership) {
        socket.emit('error', { message: 'Not a member of this team' });
        return;
      }

      const roomId = `team_${teamId}_${roomType}`;

      // Join Socket.IO room
      socket.join(roomId);

      // Update room data
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {
          id: roomId,
          teamId,
          type: roomType,
          members: new Set(),
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        });
      }

      const room = this.rooms.get(roomId);
      room.members.add(user.id);
      room.lastActivity = new Date().toISOString();

      // Update user session
      const userSession = this.userSessions.get(user.id);
      if (userSession) {
        if (!userSession.teamIds.includes(teamId)) {
          userSession.teamIds.push(teamId);
        }
        userSession.lastActivity = new Date().toISOString();
      }

      // Subscribe to Supabase realtime for this team
      this.subscribeToTeamEvents(teamId, roomId);

      // Notify room members
      socket.to(roomId).emit('user_joined_room', {
        roomId,
        user: {
          id: user.id,
          full_name: user.full_name,
          avatar_url: user.avatar_url
        },
        timestamp: new Date().toISOString()
      });

      // Send success response
      socket.emit('room_joined', {
        roomId,
        teamId,
        type: roomType,
        memberCount: room.members.size,
        timestamp: new Date().toISOString()
      });

      console.log(`👥 User ${user.email} joined room ${roomId}`);

    } catch (error) {
      console.error('Join team room error:', error);
      socket.emit('error', { message: 'Failed to join team room' });
    }
  }

  /**
   * Subscribe to team events via Supabase realtime
   * @param {string} teamId - Team ID
   * @param {string} roomId - Room ID
   */
  subscribeToTeamEvents(teamId, roomId) {
    // Check if already subscribed
    const existingSubscription = Array.from(this.activeStreams.values())
      .find(stream => stream.teamId === teamId && stream.type === 'team_events');

    if (existingSubscription) {
      return; // Already subscribed
    }

    // Subscribe to check-ins
    const checkInChannel = realtimeService.subscribeToTeamCheckIns(teamId, (event) => {
      this.broadcastToRoom(roomId, 'team_checkin_update', {
        type: event.type,
        data: event.data,
        timestamp: event.timestamp
      });
    });

    // Subscribe to insights
    const insightChannel = realtimeService.subscribeToTeamInsights(teamId, (event) => {
      this.broadcastToRoom(roomId, 'team_insight_update', {
        type: event.type,
        data: event.data,
        timestamp: event.timestamp
      });
    });

    // Subscribe to dashboard changes
    const dashboardChannel = realtimeService.subscribeToLiveDashboard(teamId, (event) => {
      this.broadcastToRoom(roomId, 'dashboard_update', {
        type: event.type,
        source: event.source,
        data: event.data,
        timestamp: event.timestamp
      });
    });

    // Store subscription
    const streamId = uuidv4();
    this.activeStreams.set(streamId, {
      id: streamId,
      teamId,
      roomId,
      type: 'team_events',
      channels: {
        checkins: checkInChannel,
        insights: insightChannel,
        dashboard: dashboardChannel
      },
      createdAt: new Date().toISOString()
    });
  }

  /**
   * Handle analytics subscription for live chart updates
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   * @param {Object} data - Subscription data
   */
  async handleSubscribeAnalytics(socket, user, data) {
    try {
      const { teamId, chartType, period = '24h' } = data;

      // Verify team membership
      const { data: membership, error } = await supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', user.id)
        .single();

      if (error || !membership) {
        socket.emit('error', { message: 'Not a member of this team' });
        return;
      }

      const streamId = `analytics_${teamId}_${chartType}_${socket.id}`;

      // Create analytics stream
      this.activeStreams.set(streamId, {
        id: streamId,
        socketId: socket.id,
        userId: user.id,
        teamId,
        type: 'analytics',
        chartType,
        period,
        lastUpdate: new Date().toISOString(),
        isActive: true
      });

      // Send initial data
      const initialData = await this.getAnalyticsData(teamId, chartType, period);
      socket.emit('analytics_data', {
        streamId,
        chartType,
        period,
        data: initialData,
        timestamp: new Date().toISOString()
      });

      // Setup periodic updates
      this.scheduleAnalyticsUpdates(streamId, socket);

      socket.emit('analytics_subscribed', {
        streamId,
        teamId,
        chartType,
        period,
        timestamp: new Date().toISOString()
      });

      console.log(`📊 Analytics subscription created: ${streamId}`);

    } catch (error) {
      console.error('Subscribe analytics error:', error);
      socket.emit('error', { message: 'Failed to subscribe to analytics' });
    }
  }

  /**
   * Handle collaboration session start
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   * @param {Object} data - Collaboration data
   */
  async handleStartCollaboration(socket, user, data) {
    try {
      const { teamId, sessionType, metadata = {} } = data;

      const sessionId = uuidv4();
      const collaborationRoom = `collaboration_${sessionId}`;

      // Create collaboration session
      const session = {
        id: sessionId,
        teamId,
        type: sessionType,
        createdBy: user.id,
        participants: new Set([user.id]),
        metadata,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        status: 'active'
      };

      this.collaborationSessions.set(sessionId, session);

      // Join collaboration room
      socket.join(collaborationRoom);

      // Notify team room about collaboration session
      const teamRoomId = `team_${teamId}_general`;
      this.broadcastToRoom(teamRoomId, 'collaboration_started', {
        sessionId,
        type: sessionType,
        createdBy: {
          id: user.id,
          full_name: user.full_name,
          avatar_url: user.avatar_url
        },
        timestamp: new Date().toISOString()
      });

      socket.emit('collaboration_created', {
        sessionId,
        roomId: collaborationRoom,
        participants: Array.from(session.participants),
        timestamp: new Date().toISOString()
      });

      console.log(`🤝 Collaboration session created: ${sessionId} by ${user.email}`);

    } catch (error) {
      console.error('Start collaboration error:', error);
      socket.emit('error', { message: 'Failed to start collaboration' });
    }
  }

  /**
   * Handle collaboration events (cursor movement, edits, etc.)
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   * @param {Object} data - Event data
   */
  handleCollaborationEvent(socket, user, data) {
    try {
      const { sessionId, eventType, payload } = data;

      const session = this.collaborationSessions.get(sessionId);
      if (!session || !session.participants.has(user.id)) {
        socket.emit('error', { message: 'Not part of this collaboration session' });
        return;
      }

      // Update session activity
      session.lastActivity = new Date().toISOString();

      // Broadcast event to other participants
      const collaborationRoom = `collaboration_${sessionId}`;
      socket.to(collaborationRoom).emit('collaboration_event', {
        sessionId,
        eventType,
        user: {
          id: user.id,
          full_name: user.full_name,
          avatar_url: user.avatar_url
        },
        payload,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Collaboration event error:', error);
      socket.emit('error', { message: 'Failed to process collaboration event' });
    }
  }

  /**
   * Handle mobile focus/blur events for optimized connectivity
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   */
  handleMobileFocus(socket, user) {
    const userData = this.socketUsers.get(socket.id);
    if (userData) {
      userData.isMobileActive = true;
      userData.lastFocus = new Date().toISOString();
    }

    // Resume active subscriptions
    this.resumeMobileSubscriptions(socket, user);

    console.log(`📱 Mobile focus: ${user.email}`);
  }

  /**
   * Handle mobile blur for battery optimization
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   */
  handleMobileBlur(socket, user) {
    const userData = this.socketUsers.get(socket.id);
    if (userData) {
      userData.isMobileActive = false;
      userData.lastBlur = new Date().toISOString();
    }

    // Pause non-essential subscriptions
    this.pauseMobileSubscriptions(socket, user);

    console.log(`📱 Mobile blur: ${user.email}`);
  }

  /**
   * Handle disconnection
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   * @param {string} reason - Disconnect reason
   */
  handleDisconnection(socket, user, reason) {
    console.log(`🔌 Client disconnected: ${socket.id} (${user.email}) - ${reason}`);

    // Clean up user data
    this.socketUsers.delete(socket.id);
    this.userSessions.delete(user.id);

    // Clean up room memberships
    this.rooms.forEach((room, roomId) => {
      if (room.members.has(user.id)) {
        room.members.delete(user.id);

        // Notify room members
        socket.to(roomId).emit('user_left_room', {
          roomId,
          user: {
            id: user.id,
            full_name: user.full_name
          },
          timestamp: new Date().toISOString()
        });

        // Clean up empty rooms
        if (room.members.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    });

    // Clean up active streams
    this.activeStreams.forEach((stream, streamId) => {
      if (stream.socketId === socket.id) {
        this.activeStreams.delete(streamId);
      }
    });

    // Clean up collaboration sessions
    this.collaborationSessions.forEach((session, sessionId) => {
      if (session.participants.has(user.id)) {
        session.participants.delete(user.id);

        // Notify remaining participants
        const collaborationRoom = `collaboration_${sessionId}`;
        socket.to(collaborationRoom).emit('collaboration_participant_left', {
          sessionId,
          user: {
            id: user.id,
            full_name: user.full_name
          },
          timestamp: new Date().toISOString()
        });

        // End session if creator left or no participants
        if (session.createdBy === user.id || session.participants.size === 0) {
          session.status = 'ended';
          session.endedAt = new Date().toISOString();

          this.io.to(collaborationRoom).emit('collaboration_ended', {
            sessionId,
            endedBy: user.id,
            timestamp: new Date().toISOString()
          });
        }
      }
    });
  }

  /**
   * Setup Redis integration for pub/sub events
   */
  setupRedisIntegration() {
    // Redis pub/sub integration for broadcasting events across instances
    if (pubsubService && pubsubService.subscribe) {
      // Subscribe to team activity events
      pubsubService.subscribe('team_activity:*', (channel, message) => {
        try {
          const data = JSON.parse(message);
          const teamId = channel.split(':')[1];
          const roomId = `team_${teamId}_general`;

          this.broadcastToRoom(roomId, 'team_activity', data);
        } catch (error) {
          console.error('Redis team activity broadcast error:', error);
        }
      });

      // Subscribe to check-in events
      pubsubService.subscribe('checkins:*', (channel, message) => {
        try {
          const data = JSON.parse(message);
          const teamId = channel.split(':')[1];
          const roomId = `team_${teamId}_general`;

          this.broadcastToRoom(roomId, 'checkin_update', data);
        } catch (error) {
          console.error('Redis check-in broadcast error:', error);
        }
      });

      // Subscribe to alert events
      pubsubService.subscribe('alerts:*', (channel, message) => {
        try {
          const data = JSON.parse(message);
          const teamId = channel.split(':')[1];
          const roomId = `team_${teamId}_general`;

          this.broadcastToRoom(roomId, 'alert_triggered', data);
        } catch (error) {
          console.error('Redis alert broadcast error:', error);
        }
      });

      console.log('🔌 Redis integration setup for WebSocket broadcasting');
    }
  }

  /**
   * Setup event handlers for integration with existing services
   */
  setupEventHandlers() {
    // Redis pub/sub integration
    if (pubsubService) {
      // Listen for Redis events and broadcast to WebSocket clients
      this.setupRedisIntegration();
    }
  }

  /**
   * Setup heartbeat for connection monitoring
   */
  setupHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.io.emit('heartbeat', {
        timestamp: new Date().toISOString(),
        connectedClients: this.io.sockets.sockets.size
      });
    }, 30000); // Every 30 seconds
  }

  /**
   * Broadcast message to specific room
   * @param {string} roomId - Room ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  broadcastToRoom(roomId, event, data) {
    if (this.io) {
      this.io.to(roomId).emit(event, data);
    }
  }

  /**
   * Get current analytics data
   * @param {string} teamId - Team ID
   * @param {string} chartType - Chart type
   * @param {string} period - Time period
   * @returns {Promise<Object>} Analytics data
   */
  async getAnalyticsData(teamId, chartType, period) {
    // This would integrate with your analytics service
    // For now, return mock data structure
    return {
      labels: [],
      datasets: [],
      summary: {
        total: 0,
        average: 0,
        trend: 'stable'
      }
    };
  }

  /**
   * Schedule periodic updates for analytics streams
   * @param {string} streamId - Stream ID
   * @param {Object} socket - Socket instance
   */
  scheduleAnalyticsUpdates(streamId, socket) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) return;

    // Update every 30 seconds for active streams
    const updateInterval = setInterval(async () => {
      const currentStream = this.activeStreams.get(streamId);
      if (!currentStream || !currentStream.isActive) {
        clearInterval(updateInterval);
        return;
      }

      try {
        const data = await this.getAnalyticsData(
          currentStream.teamId,
          currentStream.chartType,
          currentStream.period
        );

        socket.emit('analytics_update', {
          streamId,
          data,
          timestamp: new Date().toISOString()
        });

        currentStream.lastUpdate = new Date().toISOString();
      } catch (error) {
        console.error('Analytics update error:', error);
        socket.emit('analytics_error', {
          streamId,
          error: 'Failed to update analytics data'
        });
      }
    }, 30000);
  }

  /**
   * Resume mobile subscriptions after focus
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   */
  resumeMobileSubscriptions(socket, user) {
    // Resume paused streams
    this.activeStreams.forEach((stream) => {
      if (stream.userId === user.id && stream.isPaused) {
        stream.isPaused = false;
        stream.isActive = true;
      }
    });
  }

  /**
   * Pause mobile subscriptions during blur
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   */
  pauseMobileSubscriptions(socket, user) {
    // Pause non-essential streams to save battery
    this.activeStreams.forEach((stream) => {
      if (stream.userId === user.id && stream.type === 'analytics') {
        stream.isPaused = true;
        stream.isActive = false;
      }
    });
  }

  /**
   * Handle activity ping for presence updates
   * @param {Object} socket - Socket instance
   * @param {Object} user - User data
   */
  handleActivityPing(socket, user) {
    const userSession = this.userSessions.get(user.id);
    if (userSession) {
      userSession.lastActivity = new Date().toISOString();
    }

    const userData = this.socketUsers.get(socket.id);
    if (userData) {
      userData.lastSeen = new Date().toISOString();
    }
  }

  /**
   * Get WebSocket server statistics
   * @returns {Object} Server stats
   */
  getStats() {
    return {
      connectedClients: this.io ? this.io.sockets.sockets.size : 0,
      activeRooms: this.rooms.size,
      activeStreams: this.activeStreams.size,
      collaborationSessions: this.collaborationSessions.size,
      userSessions: this.userSessions.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup and shutdown
   */
  cleanup() {
    console.log('🔌 Cleaning up WebSocket service...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.activeStreams.clear();
    this.rooms.clear();
    this.userSessions.clear();
    this.socketUsers.clear();
    this.collaborationSessions.clear();

    if (this.io) {
      this.io.close();
    }

    console.log('✅ WebSocket service cleaned up');
  }
}

module.exports = new WebSocketService();
