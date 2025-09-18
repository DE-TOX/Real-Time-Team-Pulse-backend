# 📚 Team Pulse API - Swagger Documentation

## 🎯 **Access Your API Documentation**

### **Live Documentation URL:**
```
http://localhost:3001/api-docs
```

### **Root Redirect:**
```
http://localhost:3001/ → redirects to /api-docs
```

## 🚀 **Getting Started with Swagger UI**

### **1. Open the Documentation**
1. Start your backend server: `npm run dev`
2. Open browser: `http://localhost:3001/api-docs`
3. You'll see the interactive Swagger UI with all endpoints

### **2. Authenticate for Testing**
1. **Get a JWT Token:**
   - Use the `/api/auth/login` endpoint in Swagger
   - Enter your credentials: `test.manager@example.com` / `TestPass123`
   - Copy the `access_token` from the response

2. **Set Authorization:**
   - Click the **🔒 Authorize** button at the top
   - Enter: `Bearer YOUR_JWT_TOKEN_HERE`
   - Click **Authorize**

3. **Test Protected Endpoints:**
   - All endpoints with 🔒 icon are now authenticated
   - Test any protected endpoint directly in Swagger UI

## 📋 **API Endpoints Overview**

### **🔐 Authentication Endpoints**
```
POST   /api/auth/register          - Register new user
POST   /api/auth/login             - Login user  
POST   /api/auth/logout            - Logout user
GET    /api/auth/profile           - Get user profile
PUT    /api/auth/profile           - Update profile
POST   /api/auth/change-password   - Change password
POST   /api/auth/reset-password-request - Request password reset
POST   /api/auth/reset-password    - Reset password with token
GET    /api/auth/users             - Get all users (admin)
PATCH  /api/auth/users/{id}/role   - Update user role (admin)
```

### **👥 Team Management Endpoints**
```
GET    /api/teams                  - Get user's teams
POST   /api/teams                  - Create team (manager)
GET    /api/teams/{id}             - Get team details
DELETE /api/teams/{id}             - Delete team (manager)
PUT    /api/teams/{id}/settings    - Update team settings (manager)
```

### **🎫 Invitation Endpoints**
```
GET    /api/teams/{id}/invitations - Get team invitations (manager)
POST   /api/teams/{id}/invitations - Send invitation (manager)
POST   /api/teams/join             - Join team with invite code
```

### **👤 Member Management**
```
PATCH  /api/teams/{id}/members/{userId}/role - Update member role
DELETE /api/teams/{id}/members/{userId}      - Remove member
```

### **🏥 System Health**
```
GET    /health                     - API health check
```

## 🧪 **Testing Workflows in Swagger**

### **Complete Team Management Flow:**

1. **🔐 Register/Login User**
   ```
   POST /api/auth/register
   {
     "email": "manager@example.com",
     "password": "TestPass123",
     "fullName": "Team Manager",
     "role": "manager"
   }
   ```

2. **🏗️ Create Team**
   ```
   POST /api/teams
   {
     "name": "Dev Team",
     "description": "Our development team",
     "isPrivate": false,
     "maxMembers": 20,
     "allowAnonymousCheckins": true
   }
   ```

3. **📧 Send Invitation**
   ```
   POST /api/teams/{teamId}/invitations
   {
     "email": "member@example.com",
     "role": "member",
     "expiresInHours": 72
   }
   ```

4. **🎫 Join Team**
   ```
   POST /api/teams/join
   {
     "inviteCode": "ABC12345"
   }
   ```

## 🔍 **Schema Documentation**

### **📊 Data Models:**
- **User**: Complete user information
- **Profile**: User profile with role and metadata
- **Team**: Team information with settings
- **TeamMember**: Team membership details
- **TeamInvitation**: Invitation details with codes
- **Session**: JWT session information
- **Error**: Standardized error responses

### **🔒 Security:**
- **JWT Bearer Authentication**: Required for most endpoints
- **Role-based Access**: member/manager/admin hierarchy
- **Rate Limiting**: Built-in protection against abuse
- **Input Validation**: Comprehensive Joi schema validation

## 🎨 **Swagger UI Features**

### **Interactive Testing:**
- ✅ **Try it out**: Test any endpoint directly
- ✅ **Request/Response**: View examples and schemas
- ✅ **Authentication**: Built-in JWT token management
- ✅ **Error Codes**: Detailed error documentation
- ✅ **Validation**: Input validation examples

### **Documentation Features:**
- 📚 **Complete API Reference**: All endpoints documented
- 🔍 **Search**: Find endpoints quickly
- 📋 **Examples**: Request/response examples
- 🔐 **Security**: Authentication requirements
- ⚡ **Real-time**: Test against live API

## 🛠️ **Development Benefits**

### **For Developers:**
- **No Postman needed**: Test directly in browser
- **Type Safety**: Schema validation and examples
- **Quick Testing**: Instant API exploration
- **Documentation**: Always up-to-date docs

### **For Frontend Teams:**
- **Clear Contracts**: Exact API specifications
- **Response Formats**: Know what to expect
- **Error Handling**: Understand error codes
- **Authentication**: JWT integration examples

## 📱 **Mobile/Responsive**
The Swagger UI is fully responsive and works on:
- 💻 Desktop browsers
- 📱 Mobile devices  
- 📟 Tablets

## 🎯 **Quick Test Commands**

### **Health Check:**
```bash
curl http://localhost:3001/health
```

### **Login & Get Token:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test.manager@example.com","password":"TestPass123"}'
```

### **Create Team:**
```bash
curl -X POST http://localhost:3001/api/teams \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"Test Team","description":"Testing via curl"}'
```
-
---

## 🎉 **Your API is Now Fully Documented!**

**Access URL**: `http://localhost:3001/api-docs`

**Features Complete:**
- ✅ Interactive Swagger UI
- ✅ Complete API documentation  
- ✅ JWT authentication testing
- ✅ Request/response examples
- ✅ Schema validation
- ✅ Error code documentation
- ✅ Real-time testing capabilities

**Perfect for:**
- 🔧 **API Development & Testing**
- 📚 **Team Documentation**
- 🚀 **Frontend Integration**
- 🎯 **Quality Assurance**