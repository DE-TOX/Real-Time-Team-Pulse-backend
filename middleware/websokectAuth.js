const supabase = require('../config/supabase');

/**
 * WebSocket authentication middleware
 * @param {string} token - JWT token
 * @returns {Promise<Object|null>} User data or null
 */
async function authenticateWebSocket(token) {
  try {
    if (!token) {
      return null;
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace(/^Bearer\s+/, '');

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(cleanToken);

    if (error || !user) {
      console.error('WebSocket auth error:', error?.message);
      return null;
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError.message);
    }

    return {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || 'Unknown User',
      avatar_url: profile?.avatar_url,
      role: profile?.role || 'member',
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at
    };

  } catch (error) {
    console.error('WebSocket authentication error:', error);
    return null;
  }
}

/**
 * Middleware to check team membership for WebSocket operations
 * @param {string} userId - User ID
 * @param {string} teamId - Team ID
 * @returns {Promise<Object|null>} Membership data or null
 */
async function checkTeamMembership(userId, teamId) {
  try {
    const { data: membership, error } = await supabase
      .from('team_members')
      .select('role, joined_at')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .single();

    if (error || !membership) {
      return null;
    }

    return membership;
  } catch (error) {
    console.error('Team membership check error:', error);
    return null;
  }
}

/**
 * Check if user has manager permissions for team
 * @param {string} userId - User ID
 * @param {string} teamId - Team ID
 * @returns {Promise<boolean>} True if user is manager
 */
async function isTeamManager(userId, teamId) {
  try {
    const membership = await checkTeamMembership(userId, teamId);
    return membership && membership.role === 'manager';
  } catch (error) {
    console.error('Manager check error:', error);
    return false;
  }
}

/**
 * Rate limiting for WebSocket events
 * @param {Map} rateLimits - Rate limit storage
 * @param {string} userId - User ID
 * @param {string} eventType - Event type
 * @param {number} maxEvents - Max events per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} True if within rate limit
 */
function checkWebSocketRateLimit(rateLimits, userId, eventType, maxEvents = 100, windowMs = 60000) {
  const key = `${userId}:${eventType}`;
  const now = Date.now();

  if (!rateLimits.has(key)) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }

  const limit = rateLimits.get(key);

  // Reset window if expired
  if (now - limit.windowStart > windowMs) {
    limit.count = 1;
    limit.windowStart = now;
    return true;
  }

  // Check if within limit
  if (limit.count >= maxEvents) {
    return false;
  }

  limit.count++;
  return true;
}

/**
 * Validate WebSocket event data
 * @param {Object} data - Event data
 * @param {Object} schema - Validation schema
 * @returns {Object} Validation result
 */
function validateWebSocketData(data, schema) {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Required field check
    if (rules.required && (value === undefined || value === null)) {
      errors.push(`${field} is required`);
      continue;
    }

    // Skip validation if field is not present and not required
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be of type ${rules.type}`);
    }

    // String length validation
    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`${field} must be at most ${rules.maxLength} characters`);
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }

    // UUID validation
    if (rules.format === 'uuid') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value)) {
        errors.push(`${field} must be a valid UUID`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * WebSocket event schemas for validation
 */
const WebSocketSchemas = {
  join_team_room: {
    teamId: { required: true, type: 'string', format: 'uuid' },
    roomType: { type: 'string', enum: ['general', 'analytics', 'collaboration'] }
  },

  subscribe_analytics: {
    teamId: { required: true, type: 'string', format: 'uuid' },
    chartType: { required: true, type: 'string', enum: ['mood', 'energy', 'sentiment', 'participation'] },
    period: { type: 'string', enum: ['1h', '24h', '7d', '30d'] }
  },

  start_collaboration: {
    teamId: { required: true, type: 'string', format: 'uuid' },
    sessionType: { required: true, type: 'string', enum: ['whiteboard', 'document', 'meeting'] },
    metadata: { type: 'object' }
  },

  collaboration_event: {
    sessionId: { required: true, type: 'string', format: 'uuid' },
    eventType: { required: true, type: 'string', enum: ['cursor', 'edit', 'selection', 'presence'] },
    payload: { required: true, type: 'object' }
  },

  update_presence: {
    status: { type: 'string', enum: ['online', 'away', 'busy', 'offline'] },
    activity: { type: 'string', maxLength: 100 },
    location: { type: 'object' }
  }
};

module.exports = {
  authenticateWebSocket,
  checkTeamMembership,
  isTeamManager,
  checkWebSocketRateLimit,
  validateWebSocketData,
  WebSocketSchemas
};