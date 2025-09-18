/**
 * @swagger
 * components:
 *   examples:
 *     UserRegistration:
 *       summary: Manager Registration
 *       value:
 *         email: "manager@company.com"
 *         password: "SecurePass123"
 *         fullName: "John Manager"
 *         role: "manager"
 *     UserLogin:
 *       summary: User Login
 *       value:
 *         email: "user@company.com"
 *         password: "SecurePass123"
 *     TeamCreation:
 *       summary: Create Development Team
 *       value:
 *         name: "Frontend Development Team"
 *         description: "Our amazing frontend developers working on React and Next.js"
 *         isPrivate: false
 *         maxMembers: 15
 *         allowAnonymousCheckins: true
 *     TeamInvitation:
 *       summary: Invite Team Member
 *       value:
 *         email: "developer@company.com"
 *         role: "member"
 *         expiresInHours: 48
 *     JoinTeam:
 *       summary: Join Team with Code
 *       value:
 *         inviteCode: "ABC12345"
 *     ProfileUpdate:
 *       summary: Update User Profile
 *       value:
 *         fullName: "John Smith Jr."
 *         avatarUrl: "https://example.com/avatars/john.jpg"
 *     PasswordChange:
 *       summary: Change Password
 *       value:
 *         currentPassword: "OldPassword123"
 *         newPassword: "NewSecurePass456"
 *     PasswordResetRequest:
 *       summary: Request Password Reset
 *       value:
 *         email: "user@company.com"
 *     PasswordReset:
 *       summary: Reset Password with Token
 *       value:
 *         token: "reset-token-from-email"
 *         newPassword: "BrandNewPass789"
 *     TeamSettings:
 *       summary: Update Team Settings
 *       value:
 *         name: "Updated Team Name"
 *         description: "Updated team description with new goals"
 *         isPrivate: true
 *         maxMembers: 25
 *         allowAnonymousCheckins: false
 *     RoleUpdate:
 *       summary: Update Member Role
 *       value:
 *         role: "manager"
 *   responses:
 *     UnauthorizedError:
 *       description: Authentication required
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: "No token provided"
 *             code: "MISSING_TOKEN"
 *     ForbiddenError:
 *       description: Insufficient permissions
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: "Insufficient permissions"
 *             code: "INSUFFICIENT_PERMISSIONS"
 *     ValidationError:
 *       description: Input validation failed
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: "Validation failed"
 *             code: "VALIDATION_ERROR"
 *             details:
 *               - field: "email"
 *                 message: "Please provide a valid email address"
 *               - field: "password"
 *                 message: "Password must be at least 8 characters long"
 *     NotFoundError:
 *       description: Resource not found
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: "Team not found"
 *             code: "TEAM_NOT_FOUND"
 *     RateLimitError:
 *       description: Too many requests
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 *           example:
 *             error: "Too many requests, please try again later"
 *             code: "RATE_LIMIT_EXCEEDED"
 */

/**
 * @swagger
 * /api:
 *   get:
 *     tags: [Health]
 *     summary: API Root Information
 *     description: Get basic API information and version
 *     security: []
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Team Pulse API is running!
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 */