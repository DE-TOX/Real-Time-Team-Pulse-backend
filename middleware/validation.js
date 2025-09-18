const Joi = require('joi');

// User registration schema
const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'Password is required'
    }),
  
  fullName: Joi.string()
    .min(2)
    .max(100)
    .pattern(new RegExp('^[a-zA-Z\\s-\']+$'))
    .required()
    .messages({
      'string.min': 'Full name must be at least 2 characters long',
      'string.max': 'Full name must not exceed 100 characters',
      'string.pattern.base': 'Full name can only contain letters, spaces, hyphens, and apostrophes',
      'any.required': 'Full name is required'
    }),
  
  role: Joi.string()
    .valid('member', 'manager', 'admin')
    .default('member')
    .messages({
      'any.only': 'Role must be either member, manager, or admin'
    })
});

// User login schema
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

// Password reset request schema
const resetPasswordRequestSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    })
});

// Password reset schema
const resetPasswordSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Reset token is required'
    }),
  
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'New password is required'
    })
});

// Profile update schema
const updateProfileSchema = Joi.object({
  fullName: Joi.string()
    .min(2)
    .max(100)
    .pattern(new RegExp('^[a-zA-Z\\s-\']+$'))
    .messages({
      'string.min': 'Full name must be at least 2 characters long',
      'string.max': 'Full name must not exceed 100 characters',
      'string.pattern.base': 'Full name can only contain letters, spaces, hyphens, and apostrophes'
    }),
  
  avatarUrl: Joi.string()
    .uri()
    .allow('')
    .messages({
      'string.uri': 'Avatar URL must be a valid URL'
    }),
  
  role: Joi.string()
    .valid('member', 'manager', 'admin')
    .messages({
      'any.only': 'Role must be either member, manager, or admin'
    })
}).min(1).messages({
  'object.min': 'At least one field is required for update'
});

// Change password schema
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),
  
  newPassword: Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)'))
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters long',
      'string.max': 'New password must not exceed 128 characters',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'New password is required'
    })
});

// Team creation schema
const createTeamSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Team name must be at least 2 characters long',
      'string.max': 'Team name must not exceed 100 characters',
      'any.required': 'Team name is required'
    }),
  
  description: Joi.string()
    .max(500)
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),

  isPrivate: Joi.boolean()
    .default(false),

  maxMembers: Joi.number()
    .integer()
    .min(2)
    .max(100)
    .default(50)
    .messages({
      'number.min': 'Team must allow at least 2 members',
      'number.max': 'Team cannot exceed 100 members'
    }),

  allowAnonymousCheckins: Joi.boolean()
    .default(true)
});

// Team update schema
const updateTeamSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .messages({
      'string.min': 'Team name must be at least 2 characters long',
      'string.max': 'Team name must not exceed 100 characters'
    }),
  
  description: Joi.string()
    .max(500)
    .allow('')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),

  isPrivate: Joi.boolean(),
  maxMembers: Joi.number()
    .integer()
    .min(2)
    .max(100)
    .messages({
      'number.min': 'Team must allow at least 2 members',
      'number.max': 'Team cannot exceed 100 members'
    }),
  allowAnonymousCheckins: Joi.boolean()
}).min(1).messages({
  'object.min': 'At least one field is required for update'
});

// Team invitation schema
const inviteToTeamSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  role: Joi.string()
    .valid('member', 'manager')
    .default('member')
    .messages({
      'any.only': 'Role must be either member or manager'
    }),

  expiresInHours: Joi.number()
    .integer()
    .min(1)
    .max(168) // 7 days
    .default(72) // 3 days
    .messages({
      'number.min': 'Invitation must be valid for at least 1 hour',
      'number.max': 'Invitation cannot be valid for more than 7 days'
    })
});

// Accept invitation schema
const acceptInvitationSchema = Joi.object({
  inviteCode: Joi.string()
    .length(8)
    .pattern(/^[A-Z0-9]+$/)
    .required()
    .messages({
      'string.length': 'Invite code must be 8 characters long',
      'string.pattern.base': 'Invite code must contain only uppercase letters and numbers',
      'any.required': 'Invite code is required'
    })
});

// Join team by invite code schema
const joinTeamSchema = Joi.object({
  inviteCode: Joi.string()
    .length(8)
    .pattern(/^[A-Z0-9]+$/)
    .required()
    .messages({
      'string.length': 'Invite code must be 8 characters long',
      'string.pattern.base': 'Invite code must contain only uppercase letters and numbers',
      'any.required': 'Invite code is required'
    })
});

// Update member role schema
const updateMemberRoleSchema = Joi.object({
  role: Joi.string()
    .valid('member', 'manager')
    .required()
    .messages({
      'any.only': 'Role must be either member or manager',
      'any.required': 'Role is required'
    })
});

// Check-in schema
const checkInSchema = Joi.object({
  teamId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.uuid': 'Team ID must be a valid UUID',
      'any.required': 'Team ID is required'
    }),
  
  content: Joi.string()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Check-in content cannot be empty',
      'string.max': 'Check-in content must not exceed 1000 characters',
      'any.required': 'Check-in content is required'
    }),
  
  moodScore: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .required()
    .messages({
      'number.base': 'Mood score must be a number',
      'number.integer': 'Mood score must be an integer',
      'number.min': 'Mood score must be between 1 and 5',
      'number.max': 'Mood score must be between 1 and 5',
      'any.required': 'Mood score is required'
    }),
  
  energyLevel: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .required()
    .messages({
      'number.base': 'Energy level must be a number',
      'number.integer': 'Energy level must be an integer',
      'number.min': 'Energy level must be between 1 and 5',
      'number.max': 'Energy level must be between 1 and 5',
      'any.required': 'Energy level is required'
    }),
  
  isAnonymous: Joi.boolean()
    .default(false),
  
  inputMethod: Joi.string()
    .valid('text', 'voice')
    .default('text')
    .messages({
      'any.only': 'Input method must be either text or voice'
    })
});

// Validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }
    
    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

module.exports = {
  validate,
  schemas: {
    register: registerSchema,
    login: loginSchema,
    resetPasswordRequest: resetPasswordRequestSchema,
    resetPassword: resetPasswordSchema,
    updateProfile: updateProfileSchema,
    changePassword: changePasswordSchema,
    createTeam: createTeamSchema,
    updateTeam: updateTeamSchema,
    inviteToTeam: inviteToTeamSchema,
    acceptInvitation: acceptInvitationSchema,
    joinTeam: joinTeamSchema,
    updateMemberRole: updateMemberRoleSchema,
    checkIn: checkInSchema
  }
};