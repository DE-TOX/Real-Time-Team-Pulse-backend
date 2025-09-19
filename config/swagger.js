const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Team Pulse API',
      version: '1.0.0',
      description: 'A comprehensive team wellness dashboard API with real-time features, sentiment analysis, and team management capabilities.',
      contact: {
        name: 'Team Pulse API Support',
        email: 'support@teampulse.com'
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://your-production-url.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from login endpoint'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            code: {
              type: 'string',
              description: 'Error code for programmatic handling'
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' }
                }
              },
              description: 'Validation error details'
            }
          },
          required: ['error']
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique user identifier'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            aud: { type: 'string' },
            role: { type: 'string' },
            email_confirmed_at: { type: 'string', format: 'date-time' },
            last_sign_in_at: { type: 'string', format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Profile: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'User ID (matches auth user)'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            full_name: {
              type: 'string',
              description: 'User full name',
              example: 'John Doe'
            },
            avatar_url: {
              type: 'string',
              format: 'uri',
              nullable: true,
              description: 'URL to user avatar image'
            },
            role: {
              type: 'string',
              enum: ['member', 'manager', 'admin'],
              description: 'User role in the system'
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          },
          required: ['id', 'email', 'full_name', 'role']
        },
        Team: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique team identifier'
            },
            name: {
              type: 'string',
              description: 'Team name',
              example: 'Development Team'
            },
            description: {
              type: 'string',
              nullable: true,
              description: 'Team description'
            },
            invite_code: {
              type: 'string',
              description: 'Unique 8-character invite code',
              example: 'ABC12345'
            },
            created_by: {
              type: 'string',
              format: 'uuid',
              description: 'ID of user who created the team'
            },
            is_private: {
              type: 'boolean',
              description: 'Whether team is private'
            },
            max_members: {
              type: 'integer',
              minimum: 2,
              maximum: 100,
              description: 'Maximum number of team members'
            },
            allow_anonymous_checkins: {
              type: 'boolean',
              description: 'Whether anonymous check-ins are allowed'
            },
            settings: {
              type: 'object',
              description: 'Team configuration settings'
            },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            userRole: {
              type: 'string',
              enum: ['member', 'manager'],
              description: 'Current user role in this team'
            }
          },
          required: ['id', 'name', 'created_by']
        },
        TeamMember: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            team_id: {
              type: 'string',
              format: 'uuid'
            },
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            role: {
              type: 'string',
              enum: ['member', 'manager'],
              description: 'Member role in the team'
            },
            joined_at: { type: 'string', format: 'date-time' },
            profile: {
              $ref: '#/components/schemas/Profile'
            }
          }
        },
        TeamInvitation: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email address of invited user'
            },
            role: {
              type: 'string',
              enum: ['member', 'manager'],
              description: 'Role to assign to invited user'
            },
            inviteCode: {
              type: 'string',
              description: '8-character invitation code',
              example: 'ABC12345'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'When invitation expires'
            },
            acceptedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'When invitation was accepted'
            },
            createdAt: { type: 'string', format: 'date-time' },
            teamName: {
              type: 'string',
              description: 'Name of team user is invited to'
            },
            invitedBy: {
              type: 'string',
              description: 'Name of user who sent invitation'
            },
            status: {
              type: 'string',
              enum: ['pending', 'accepted', 'expired'],
              description: 'Current invitation status'
            }
          }
        },
        Session: {
          type: 'object',
          properties: {
            access_token: {
              type: 'string',
              description: 'JWT access token'
            },
            token_type: {
              type: 'string',
              example: 'bearer'
            },
            expires_in: {
              type: 'integer',
              description: 'Token expiration time in seconds'
            },
            expires_at: {
              type: 'integer',
              description: 'Token expiration timestamp'
            },
            refresh_token: {
              type: 'string',
              description: 'Refresh token for getting new access tokens'
            },
            user: {
              $ref: '#/components/schemas/User'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './routes/*.js',
    './middleware/*.js',
    './docs/*.js',
    './src/routes/*.js',
    './config/swagger.js'
  ],
};

const specs = swaggerJsdoc(options);

module.exports = {
  specs,
  swaggerUi,
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(specs, {
    explorer: true,
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { color: #3b82f6; }
    `,
    customSiteTitle: 'Team Pulse API Documentation'
  })
};