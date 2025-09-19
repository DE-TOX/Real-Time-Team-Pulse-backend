const express = require('express');
const supabase = require('../../config/supabase');
const { authenticateUser, requireRole, requireTeamMembership, securityHeaders } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validation');

const router = express.Router();

// Apply security headers to all team routes
router.use(securityHeaders);

// Helper function to generate secure invite code
const generateInviteCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

// Create team
router.post('/', authenticateUser, requireRole('manager'), validate(schemas.createTeam), async (req, res) => {
  try {
    const { name, description, isPrivate, maxMembers, allowAnonymousCheckins } = req.body;

    // Create team with enhanced settings
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert([{
        name,
        description,
        created_by: req.user.id,
        is_private: isPrivate,
        max_members: maxMembers,
        allow_anonymous_checkins: allowAnonymousCheckins,
        settings: {
          notifications: {
            check_in_reminders: true,
            team_updates: true,
            weekly_summaries: true
          },
          privacy: {
            show_member_count: true,
            allow_public_insights: !isPrivate
          }
        }
      }])
      .select()
      .single();

    if (teamError) {
      return res.status(400).json({
        error: teamError.message,
        code: 'TEAM_CREATION_FAILED'
      });
    }

    // Add creator as manager member
    const { error: memberError } = await supabase
      .from('team_members')
      .insert([{
        team_id: team.id,
        user_id: req.user.id,
        role: 'manager'
      }]);

    if (memberError) {
      console.error('Team member creation error:', memberError);
      // Delete the team if member creation fails
      await supabase.from('teams').delete().eq('id', team.id);

      return res.status(500).json({
        error: 'Failed to create team membership',
        code: 'TEAM_MEMBERSHIP_FAILED'
      });
    }

    res.status(201).json({
      message: 'Team created successfully',
      team: {
        ...team,
        userRole: 'manager'
      }
    });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({
      error: 'Failed to create team',
      code: 'TEAM_CREATION_ERROR'
    });
  }
});

// Get user's teams
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select(`
        role,
        teams (
          id, name, description, created_at,
          created_by,
          profiles!teams_created_by_fkey (
            full_name, email
          )
        )
      `)
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'TEAMS_FETCH_FAILED'
      });
    }

    const teams = data.map(item => ({
      ...item.teams,
      userRole: item.role,
      createdBy: item.teams.profiles
    }));

    res.json({ teams });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({
      error: 'Failed to fetch teams',
      code: 'TEAMS_FETCH_ERROR'
    });
  }
});

// Get team details
router.get('/:teamId', authenticateUser, requireTeamMembership, async (req, res) => {
  try {
    const { teamId } = req.params;

    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select(`
        *,
        profiles!teams_created_by_fkey (
          full_name, email
        ),
        team_members (
          role,
          profiles (
            id, full_name, email, avatar_url
          )
        )
      `)
      .eq('id', teamId)
      .single();

    if (teamError || !team) {
      return res.status(404).json({
        error: 'Team not found',
        code: 'TEAM_NOT_FOUND'
      });
    }

    res.json({
      team: {
        ...team,
        createdBy: team.profiles,
        members: team.team_members,
        userRole: req.teamRole
      }
    });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({
      error: 'Failed to fetch team',
      code: 'TEAM_FETCH_ERROR'
    });
  }
});

// Update team settings
router.put('/:teamId/settings', authenticateUser, requireTeamMembership, validate(schemas.updateTeam), async (req, res) => {
  try {
    const { teamId } = req.params;
    const updateData = { ...req.body };

    // Check if user has manager role in team
    if (req.teamRole !== 'manager') {
      return res.status(403).json({
        error: 'Only team managers can update team settings',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS'
      });
    }

    // Update team with new settings
    const { data, error } = await supabase
      .from('teams')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
        is_private: updateData.isPrivate,
        max_members: updateData.maxMembers,
        allow_anonymous_checkins: updateData.allowAnonymousCheckins
      })
      .eq('id', teamId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'TEAM_UPDATE_FAILED'
      });
    }

    res.json({
      message: 'Team settings updated successfully',
      team: data
    });
  } catch (error) {
    console.error('Update team settings error:', error);
    res.status(500).json({
      error: 'Failed to update team settings',
      code: 'TEAM_UPDATE_ERROR'
    });
  }
});

// Create team invitation
router.post('/:teamId/invitations', authenticateUser, requireTeamMembership, validate(schemas.inviteToTeam), async (req, res) => {
  try {
    const { teamId } = req.params;
    const { email, role, expiresInHours } = req.body;

    // Check if user has manager role in team
    if (req.teamRole !== 'manager') {
      return res.status(403).json({
        error: 'Only team managers can send invitations',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS'
      });
    }

    // Check if user is already a team member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', (
        await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .single()
      ).data?.id)
      .single();

    if (existingMember) {
      return res.status(400).json({
        error: 'User is already a team member',
        code: 'USER_ALREADY_MEMBER'
      });
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabase
      .from('team_invitations')
      .select('id')
      .eq('team_id', teamId)
      .eq('email', email)
      .is('accepted_at', null)
      .single();

    if (existingInvite) {
      return res.status(400).json({
        error: 'Invitation already sent to this email',
        code: 'INVITATION_ALREADY_EXISTS'
      });
    }

    // Generate unique invite code
    let inviteCode;
    let isUnique = false;
    while (!isUnique) {
      inviteCode = generateInviteCode();
      const { data: existing } = await supabase
        .from('team_invitations')
        .select('id')
        .eq('invite_code', inviteCode)
        .single();
      isUnique = !existing;
    }

    // Create invitation
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const { data: invitation, error } = await supabase
      .from('team_invitations')
      .insert([{
        team_id: teamId,
        invited_by: req.user.id,
        email,
        role,
        invite_code: inviteCode,
        expires_at: expiresAt.toISOString()
      }])
      .select(`
        *,
        teams (name),
        profiles!team_invitations_invited_by_fkey (full_name, email)
      `)
      .single();

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'INVITATION_CREATION_FAILED'
      });
    }

    // TODO: Send invitation email (integrate with email service)
    console.log(`📧 Team invitation sent: ${email} -> ${inviteCode} (expires: ${expiresAt})`);

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        inviteCode: invitation.invite_code,
        expiresAt: invitation.expires_at,
        teamName: invitation.teams.name,
        invitedBy: invitation.profiles.full_name
      }
    });
  } catch (error) {
    console.error('Create invitation error:', error);
    res.status(500).json({
      error: 'Failed to create invitation',
      code: 'INVITATION_CREATION_ERROR'
    });
  }
});

// Get team invitations
router.get('/:teamId/invitations', authenticateUser, requireTeamMembership, async (req, res) => {
  try {
    const { teamId } = req.params;

    // Check if user has manager role in team
    if (req.teamRole !== 'manager') {
      return res.status(403).json({
        error: 'Only team managers can view invitations',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS'
      });
    }

    const { data, error } = await supabase
      .from('team_invitations')
      .select(`
        id, email, role, invite_code, expires_at, accepted_at, created_at,
        profiles!team_invitations_invited_by_fkey (full_name, email),
        profiles!team_invitations_accepted_by_fkey (full_name, email)
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'INVITATIONS_FETCH_FAILED'
      });
    }

    const invitations = data.map(inv => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      inviteCode: inv.invite_code,
      expiresAt: inv.expires_at,
      acceptedAt: inv.accepted_at,
      createdAt: inv.created_at,
      invitedBy: inv.profiles.full_name,
      acceptedBy: inv.profiles?.full_name || null,
      status: inv.accepted_at ? 'accepted' : (new Date(inv.expires_at) < new Date() ? 'expired' : 'pending')
    }));

    res.json({ invitations });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({
      error: 'Failed to fetch invitations',
      code: 'INVITATIONS_FETCH_ERROR'
    });
  }
});

// Accept invitation by code
router.post('/join', authenticateUser, validate(schemas.joinTeam), async (req, res) => {
  try {
    const { inviteCode } = req.body;

    // Find invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('team_invitations')
      .select(`
        *,
        teams (id, name, max_members),
        team_members!inner (count)
      `)
      .eq('invite_code', inviteCode)
      .is('accepted_at', null)
      .single();

    if (inviteError || !invitation) {
      return res.status(404).json({
        error: 'Invalid or expired invitation code',
        code: 'INVALID_INVITE_CODE'
      });
    }

    // Check if invitation is expired
    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({
        error: 'Invitation has expired',
        code: 'INVITATION_EXPIRED'
      });
    }

    // Check if invitation is for current user's email
    if (invitation.email !== req.userProfile.email) {
      return res.status(403).json({
        error: 'This invitation is not for your email address',
        code: 'INVITATION_EMAIL_MISMATCH'
      });
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', invitation.team_id)
      .eq('user_id', req.user.id)
      .single();

    if (existingMember) {
      return res.status(400).json({
        error: 'You are already a member of this team',
        code: 'ALREADY_TEAM_MEMBER'
      });
    }

    // Check team member limit
    const { count: memberCount } = await supabase
      .from('team_members')
      .select('id', { count: 'exact' })
      .eq('team_id', invitation.team_id);

    if (memberCount >= invitation.teams.max_members) {
      return res.status(400).json({
        error: 'Team has reached maximum member limit',
        code: 'TEAM_MEMBER_LIMIT_REACHED'
      });
    }

    // Add user to team
    const { error: memberError } = await supabase
      .from('team_members')
      .insert([{
        team_id: invitation.team_id,
        user_id: req.user.id,
        role: invitation.role
      }]);

    if (memberError) {
      return res.status(500).json({
        error: 'Failed to join team',
        code: 'TEAM_JOIN_FAILED'
      });
    }

    // Mark invitation as accepted
    await supabase
      .from('team_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: req.user.id
      })
      .eq('id', invitation.id);

    res.json({
      message: 'Successfully joined team',
      team: {
        id: invitation.teams.id,
        name: invitation.teams.name,
        userRole: invitation.role
      }
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({
      error: 'Failed to accept invitation',
      code: 'INVITATION_ACCEPT_ERROR'
    });
  }
});

// Update member role
router.patch('/:teamId/members/:userId/role', authenticateUser, requireTeamMembership, validate(schemas.updateMemberRole), async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const { role } = req.body;

    // Check if user has manager role in team
    if (req.teamRole !== 'manager') {
      return res.status(403).json({
        error: 'Only team managers can update member roles',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS'
      });
    }

    // Cannot change own role
    if (userId === req.user.id) {
      return res.status(400).json({
        error: 'Cannot change your own role',
        code: 'SELF_ROLE_CHANGE_FORBIDDEN'
      });
    }

    const { data, error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .select(`
        *,
        profiles (id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'ROLE_UPDATE_FAILED'
      });
    }

    res.json({
      message: 'Member role updated successfully',
      member: {
        ...data.profiles,
        role: data.role,
        joinedAt: data.joined_at
      }
    });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({
      error: 'Failed to update member role',
      code: 'ROLE_UPDATE_ERROR'
    });
  }
});

// Delete team
router.delete('/:teamId', authenticateUser, requireTeamMembership, async (req, res) => {
  try {
    const { teamId } = req.params;

    // Check if user has admin role in team
    if (req.teamRole !== 'admin') {
      return res.status(403).json({
        error: 'Only team admins can delete teams',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS'
      });
    }

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'TEAM_DELETE_FAILED'
      });
    }

    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({
      error: 'Failed to delete team',
      code: 'TEAM_DELETE_ERROR'
    });
  }
});

// Add team member
router.post('/:teamId/members', authenticateUser, requireTeamMembership, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { email, role = 'member' } = req.body;

    // Check if user has admin role in team
    if (req.teamRole !== 'admin') {
      return res.status(403).json({
        error: 'Only team admins can add members',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS'
      });
    }

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      return res.status(400).json({
        error: 'User is already a team member',
        code: 'USER_ALREADY_MEMBER'
      });
    }

    // Add member
    const { data, error } = await supabase
      .from('team_members')
      .insert([{
        team_id: teamId,
        user_id: user.id,
        role
      }])
      .select(`
        *,
        profiles (
          id, full_name, email, avatar_url
        )
      `)
      .single();

    if (error) {
      return res.status(400).json({
        error: error.message,
        code: 'MEMBER_ADD_FAILED'
      });
    }

    res.status(201).json({
      message: 'Member added successfully',
      member: data
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      error: 'Failed to add team member',
      code: 'MEMBER_ADD_ERROR'
    });
  }
});

// Remove team member
router.delete('/:teamId/members/:userId', authenticateUser, requireTeamMembership, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    // Check if user has admin role in team or is removing themselves 
    if (req.teamRole !== 'admin' && userId !== req.user.id) {
      return res.status(403).json({
        error: 'Only team admins can remove members',
        code: 'INSUFFICIENT_TEAM_PERMISSIONS'
      });
    }

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) {
      return res.status(400).json({
        error: error.message, code: 'MEMBER_REMOVE_FAILED'
      });
    }

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      error: 'Failed to remove team member',
      code: 'MEMBER_REMOVE_ERROR'
    });
  }
});

module.exports = router;
