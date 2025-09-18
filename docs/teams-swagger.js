/**
 * @swagger
 * /api/teams:
 *   get:
 *     tags: [Teams]
 *     summary: Get user's teams
 *     description: Retrieve all teams the current user is a member of
 *     responses:
 *       200:
 *         description: Teams retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 teams:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Team'
 *                       - type: object
 *                         properties:
 *                           createdBy:
 *                             type: object
 *                             properties:
 *                               full_name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   post:
 *     tags: [Teams]
 *     summary: Create a new team
 *     description: Create a new team (requires manager role)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: Development Team
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 example: Our amazing development team
 *               isPrivate:
 *                 type: boolean
 *                 default: false
 *                 description: Whether team is private
 *               maxMembers:
 *                 type: integer
 *                 minimum: 2
 *                 maximum: 100
 *                 default: 50
 *                 description: Maximum number of team members
 *               allowAnonymousCheckins:
 *                 type: boolean
 *                 default: true
 *                 description: Allow anonymous check-ins
 *     responses:
 *       201:
 *         description: Team created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Team created successfully
 *                 team:
 *                   $ref: '#/components/schemas/Team'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (requires manager role)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/teams/{teamId}:
 *   get:
 *     tags: [Teams]
 *     summary: Get team details
 *     description: Retrieve detailed information about a specific team
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID
 *     responses:
 *       200:
 *         description: Team details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 team:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Team'
 *                     - type: object
 *                       properties:
 *                         createdBy:
 *                           $ref: '#/components/schemas/Profile'
 *                         members:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/TeamMember'
 *       403:
 *         description: Not a team member
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Team not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   delete:
 *     tags: [Teams]
 *     summary: Delete team
 *     description: Delete a team (requires manager role in team)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID
 *     responses:
 *       200:
 *         description: Team deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Team deleted successfully
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Team not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/teams/{teamId}/settings:
 *   put:
 *     tags: [Teams]
 *     summary: Update team settings
 *     description: Update team configuration (requires manager role)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               isPrivate:
 *                 type: boolean
 *               maxMembers:
 *                 type: integer
 *                 minimum: 2
 *                 maximum: 100
 *               allowAnonymousCheckins:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Team settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Team settings updated successfully
 *                 team:
 *                   $ref: '#/components/schemas/Team'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (requires manager role)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/teams/{teamId}/invitations:
 *   get:
 *     tags: [Invitations]
 *     summary: Get team invitations
 *     description: Retrieve all invitations for a team (requires manager role)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID
 *     responses:
 *       200:
 *         description: Invitations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invitations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TeamInvitation'
 *       403:
 *         description: Insufficient permissions (requires manager role)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *   post:
 *     tags: [Invitations]
 *     summary: Create team invitation
 *     description: Send an invitation to join the team (requires manager role)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: newmember@example.com
 *               role:
 *                 type: string
 *                 enum: [member, manager]
 *                 default: member
 *                 description: Role to assign to invited user
 *               expiresInHours:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 168
 *                 default: 72
 *                 description: Invitation expiration time in hours (max 7 days)
 *     responses:
 *       201:
 *         description: Invitation sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invitation sent successfully
 *                 invitation:
 *                   $ref: '#/components/schemas/TeamInvitation'
 *       400:
 *         description: User already member or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/teams/join:
 *   post:
 *     tags: [Invitations]
 *     summary: Join team by invite code
 *     description: Accept a team invitation using the invite code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inviteCode
 *             properties:
 *               inviteCode:
 *                 type: string
 *                 pattern: '^[A-Z0-9]{8}$'
 *                 example: ABC12345
 *                 description: 8-character invitation code
 *     responses:
 *       200:
 *         description: Successfully joined team
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Successfully joined team
 *                 team:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                     userRole:
 *                       type: string
 *                       enum: [member, manager]
 *       400:
 *         description: Invalid code, expired, or already member
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invitation not for your email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Invalid invitation code
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/teams/{teamId}/members/{userId}/role:
 *   patch:
 *     tags: [Teams]
 *     summary: Update member role
 *     description: Update a team member's role (requires manager role)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [member, manager]
 *                 description: New role for the member
 *     responses:
 *       200:
 *         description: Member role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Member role updated successfully
 *                 member:
 *                   $ref: '#/components/schemas/TeamMember'
 *       400:
 *         description: Cannot change own role or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/teams/{teamId}/members/{userId}:
 *   delete:
 *     tags: [Teams]
 *     summary: Remove team member
 *     description: Remove a member from the team (manager role required, or remove yourself)
 *     parameters:
 *       - in: path
 *         name: teamId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to remove
 *     responses:
 *       200:
 *         description: Member removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Member removed successfully
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Team or member not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     tags: [Authentication]
 *     summary: Get all users (Admin only)
 *     description: Retrieve paginated list of all users with search functionality
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Profile'
 *                       - type: object
 *                         properties:
 *                           team_members:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 team_id:
 *                                   type: string
 *                                 role:
 *                                   type: string
 *                                 teams:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: string
 *                                     name:
 *                                       type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       403:
 *         description: Insufficient permissions (admin required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/users/{userId}/role:
 *   patch:
 *     tags: [Authentication]
 *     summary: Update user role (Admin only)
 *     description: Update a user's system role
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [member, manager, admin]
 *                 description: New system role
 *     responses:
 *       200:
 *         description: User role updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User role updated successfully
 *                 user:
 *                   $ref: '#/components/schemas/Profile'
 *       400:
 *         description: Cannot change own admin role or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions (admin required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */