const supabase = require('../config/supabase');

// Middleware to verify JWT token and extract user
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
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

module.exports = {
  authenticateUser,
  requireRole,
  requireTeamMembership
};