const express = require('express');
const supabase = require('../config/supabase');
const { authenticateUser, requireRole, authLimiter, refreshSession, securityHeaders } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply security headers to all auth routes
router.use(securityHeaders);

// User registration
router.post('/register', authLimiter, validate(schemas.register), async (req, res) => {
  try {
    const { email, password, fullName, role = 'member' } = req.body;

    // Sign up user with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role
        }
      }
    });

    if (authError) {
      return res.status(400).json({
        error: authError.message,
        code: 'SIGNUP_FAILED'
      });
    }

    // Create user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert([{
        id: authData.user.id,
        email,
        full_name: fullName,
        role
      }])
      .select()
      .single();

    if (profileError) {
      console.error('Profile creation error:', profileError);
      return res.status(500).json({
        error: 'Failed to create user profile',
        code: 'PROFILE_CREATION_FAILED'
      });
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        profile
      },
      session: authData.session
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR'
    });
  }
});

// User login
router.post('/login', authLimiter, validate(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({
        error: error.message,
        code: 'LOGIN_FAILED'
      });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      message: 'Login successful',
      user: data.user,
      profile: profile || null,
      session: data.session
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

// User logout
router.post('/logout', authenticateUser, async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'LOGOUT_FAILED'
      });
    }

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

// Get current user profile
router.get('/profile', authenticateUser, refreshSession, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, email, full_name, avatar_url, role, created_at, updated_at,
        team_members (
          team_id,
          role,
          teams (
            id, name, description
          )
        )
      `)
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(404).json({
        error: 'Profile not found',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    res.json({
      profile: data,
      lastActivity: req.lastActivity
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to fetch profile',
      code: 'PROFILE_FETCH_ERROR'
    });
  }
});

// Update user profile
router.put('/profile', authenticateUser, validate(schemas.updateProfile), async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'PROFILE_UPDATE_FAILED'
      });
    }

    res.json({
      message: 'Profile updated successfully',
      profile: data
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      code: 'PROFILE_UPDATE_ERROR'
    });
  }
});

// Change password
router.post('/change-password', authenticateUser, validate(schemas.changePassword), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword
    });

    if (verifyError) {
      return res.status(400).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      return res.status(400).json({
        error: updateError.message,
        code: 'PASSWORD_UPDATE_FAILED'
      });
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      code: 'PASSWORD_CHANGE_ERROR'
    });
  }
});

// Get all users (admin only)
router.get('/users', authenticateUser, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('profiles')
      .select(`
        id, email, full_name, avatar_url, role, created_at, updated_at,
        team_members (
          team_id,
          role,
          teams (
            id, name
          )
        )
      `);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'USERS_FETCH_FAILED'
      });
    }

    res.json({
      users: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      code: 'USERS_FETCH_ERROR'
    });
  }
});

// Request password reset
router.post('/reset-password-request', authLimiter, validate(schemas.resetPasswordRequest), async (req, res) => {
  try {
    const { email } = req.body;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/reset-password`
    });

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'PASSWORD_RESET_REQUEST_FAILED'
      });
    }

    // Always return success to prevent email enumeration
    res.json({
      message: 'If an account with this email exists, a password reset link has been sent'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      error: 'Failed to process password reset request',
      code: 'PASSWORD_RESET_REQUEST_ERROR'
    });
  }
});

// Reset password with token
router.post('/reset-password', authLimiter, validate(schemas.resetPassword), async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Verify the reset token by exchanging it for a session
    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'recovery'
    });

    if (sessionError || !sessionData.session) {
      return res.status(400).json({
        error: 'Invalid or expired reset token',
        code: 'INVALID_RESET_TOKEN'
      });
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      return res.status(400).json({
        error: updateError.message,
        code: 'PASSWORD_UPDATE_FAILED'
      });
    }

    res.json({
      message: 'Password reset successfully',
      session: sessionData.session
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      error: 'Failed to reset password',
      code: 'PASSWORD_RESET_ERROR'
    });
  }
});

// Update user role (admin only)
router.patch('/users/:userId/role', authenticateUser, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['member', 'manager', 'admin'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
        code: 'INVALID_ROLE'
      });
    }

    // Prevent self-demotion from admin
    if (userId === req.user.id && role !== 'admin') {
      return res.status(400).json({
        error: 'Cannot change your own admin role',
        code: 'SELF_ROLE_CHANGE_FORBIDDEN'
      });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        role,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'ROLE_UPDATE_FAILED'
      });
    }

    res.json({
      message: 'User role updated successfully',
      user: data
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      error: 'Failed to update user role',
      code: 'ROLE_UPDATE_ERROR'
    });
  }
});

module.exports = router;