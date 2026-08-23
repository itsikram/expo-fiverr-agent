# Password Reset Setup Guide

## What Was Added

A complete password reset feature has been added to both the Expo app and the server. Users can now reset their password if they forget it.

## Expo App Changes

### New Files
- `screens/ResetPasswordScreen.js` - Password reset form with two-step process

### Modified Files
- `screens/AuthScreen.js` - Added "Forgot Password?" link on login screen
- `utils/authService.js` - Added password reset API functions

### Documentation
- `PASSWORD_RESET.md` - Detailed documentation
- `RESET_PASSWORD_FLOW.md` - Visual flow diagrams

## Server Changes

### Modified Files
- `src/models/User.js` - Added `passwordReset` field to user schema
- `src/controllers/authController.js` - Added password reset functions
- `src/routes/authRoutes.js` - Added two new API endpoints

### New Files
- `src/services/EmailService.js` - Email sending service
- `PASSWORD_RESET.md` - Server-side documentation

## How to Use

### 1. Configure Email on Server

Add these environment variables to your `.env` file:

```env
# Email Configuration (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourapp.com

# Frontend URL for reset link
FRONTEND_URL=http://localhost:3000
```

### 2. Install Dependencies on Server

```bash
cd fiverr-server
npm install nodemailer
```

### 3. Test the Flow

#### On the Expo App:
1. Go to login screen
2. Click **"Forgot Password?"** link
3. Enter your email address
4. Click **"Send Reset Link"**
5. Check your email for the reset link and token

#### Email Step:
- You'll receive an email with a password reset link
- Copy the token from the email

#### On the Expo App (Step 2):
1. Paste the token in the "Reset Token" field
2. Enter your new password
3. Confirm the password
4. Click **"Reset Password"**
5. You'll see a success message
6. Go back to login
7. Log in with your new password ✓

## API Endpoints

### Request Password Reset
```
POST /auth/request-password-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

Response:
```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

### Reset Password
```
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "token": "abc123def456...",
  "newPassword": "newsecurepassword"
}
```

Response:
```json
{
  "success": true,
  "message": "Password has been reset successfully."
}
```

## Features

### Client-Side (Expo App)
✓ Two-step password reset flow
✓ Email validation
✓ Password strength validation (minimum 6 characters)
✓ Password confirmation matching
✓ Show/hide password toggles
✓ Loading states
✓ Success and error messages
✓ Responsive design with gradient UI

### Server-Side
✓ Email sending via Nodemailer
✓ Random token generation (32 bytes)
✓ Token expiration (1 hour)
✓ Password hashing with PBKDF2
✓ Unique salt per user
✓ Token validation before password update

## Troubleshooting

### Email not sending?

1. **Check environment variables:**
   - Verify EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD are correct
   - For Gmail, use an app password (not your regular password)

2. **Enable Gmail app password:**
   - Enable 2-Factor Authentication on Gmail
   - Go to https://myaccount.google.com/apppasswords
   - Select Mail → Windows Computer
   - Use the generated password in EMAIL_PASSWORD

3. **Check server logs:**
   - Look for email service errors in the console
   - Verify the email configuration is loaded

### Reset token expired?

- Tokens are valid for 1 hour
- User