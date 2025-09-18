const supabase = require('../config/supabase');
const rateLimit = require('express-rate-limit');

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Enhanced middleware to verify JWT token and extract user
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'No token provided',
        code: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Validate token format (basic JWT structure check)
    if (!token || token.split('.').length !== 3) {
      return res.status(401).json({ 
        error: 'Invalid token format',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID'
      });
    }

    // Check if user profile exists and is active
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at, updated_at')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ 
        error: 'User profile not found',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    // Attach user and profile to request object
    req.user = user;
    req.userProfile = profile;
    req.authToken = token;
    
    // Track last activity
    req.lastActivity = new Date().toISOString();
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Middleware to check if user has required role
const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Get user profile with role
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', req.user.id)
        .single();

      if (error || !profile) {
        return res.status(403).json({ error: 'Profile not found' });
      }

      // Check role hierarchy: admin > manager > member
      const roleHierarchy = { admin: 3, manager: 2, member: 1 };
      const userRoleLevel = roleHierarchy[profile.role] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      req.userRole = profile.role;
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

// Middleware to check team membership
const requireTeamMembership = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const teamId = req.params.teamId || req.body.team_id;
    
    if (!teamId) {
      return res.status(400).json({ error: 'Team ID required' });
    }

    // Check if user is a member of the team
    const { data: membership, error } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !membership) {
      return res.status(403).json({ error: 'Not a team member' });
    }

    req.teamRole = membership.role;
    req.teamId = teamId;
    next();
  } catch (error) {
    console.error('Team membership check error:', error);
    res.status(500).json({ error: 'Team membership check failed' });
  }
};

// Session management middleware
const refreshSession = async (req, res, next) => {
  try {
    if (!req.authToken) {
      return next(); // Skip if no token
    }

    // Check if token is close to expiry (refresh if expires in next 30 minutes)
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (session && session.expires_at) {
      const expiresAt = new Date(session.expires_at * 1000);
      const now = new Date();
      const thirtyMinutes = 30 * 60 * 1000;
      
      if (expiresAt.getTime() - now.getTime() < thirtyMinutes) {
        // Token is close to expiry, attempt refresh
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (!refreshError && refreshData.session) {
          // Send new token in response header
          res.setHeader('X-New-Token', refreshData.session.access_token);
        }
      }
    }
    
    next();
  } catch (error) {
    console.error('Session refresh error:', error);
    next(); // Continue even if refresh fails
  }
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
};

module.exports = {
  authenticateUser,
  requireRole,
  requireTeamMembership,
  authLimiter,
  refreshSession,
  securityHeaders
};
