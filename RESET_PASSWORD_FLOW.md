# Password Reset Flow Diagram

## User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOGIN SCREEN                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Email: [__________]                                            │
│  Password: [__________]  👁️                                    │
│                                                                 │
│  [LOG IN BUTTON]                                                │
│                                                                 │
│  Don't have account? Register                                   │
│  🔗 Forgot Password?  ← NEW LINK                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    (User clicks "Forgot Password?")
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│               RESET PASSWORD SCREEN - STEP 1                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Reset Password                                                 │
│  Enter your email to receive a password reset link             │
│                                                                 │
│  Email Address:                                                 │
│  [user@example.com]                                             │
│                                                                 │
│  [SEND RESET LINK BUTTON]                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
            (User submits email, server sends reset email)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│               RESET PASSWORD SCREEN - STEP 2                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ A password reset link has been sent to your email           │
│                                                                 │
│  Reset Token:                                                   │
│  [abc123def456...]                                              │
│  (Copy from email)                                              │
│                                                                 │
│  New Password:                                                  │
│  [__________]  👁️                                              │
│                                                                 │
│  Confirm Password:                                              │
│  [__________]  👁️                                              │
│                                                                 │
│  [RESET PASSWORD BUTTON]                                        │
│  [Back to Email]                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
          (User enters token and new password)
                              ↓
                    (Server validates token)
                    (Server updates password)
                              ↓
                      SUCCESS ALERT
                              ↓
                    Back to Login Screen
                              ↓
              User logs in with new password ✓

```

## Server API Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXPO APP CLIENT                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ POST /auth/request-password-reset
                              │ { email: "user@example.com" }
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    FIVERR SERVER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Find user by email                                          │
│  2. Generate random reset token (32 bytes)                      │
│  3. Set token expiration (1 hour)                               │
│  4. Save token to database                                      │
│  5. Send email with reset link + token                          │
│  6. Return success message                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ ← Email sent to user ←
                              │
                              │ POST /auth/reset-password
                              │ {
                              │   email: "user@example.com",
                              │   token: "abc123def456...",
                              │   newPassword: "newpass123"
                              │ }
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    FIVERR SERVER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Find user by email                                          │
│  2. Validate reset token exists and not expired                 │
│  3. Hash new password with salt                                 │
│  4. Update passwordHash and passwordSalt                        │
│  5. Clear reset token                                           │
│  6. Return success message                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
                      SUCCESS RESPONSE
                              │
                              ↓
              User logs in with new password ✓
```

## File Structure

```
fiverr-expo/
├── screens/
│   ├── AuthScreen.js              (MODIFIED - added forgot password link)
│   └── ResetPasswordScreen.js      (NEW - password reset form)
├── utils/
│   └── authService.js             (MODIFIED - added reset functions)
├── PASSWORD_RESET.md              (Documentation)
└── RESET_PASSWORD_FLOW.md         (This file)
```

## Key Features

✓ **Two-Step Process**
  - Step 1: Request reset email
  - Step 2: Confirm token and new password

✓ **Security**
  - Tokens expire after 1 hour
  - Passwords hashed with PBKDF2
  - Unique salt per user

✓ **User Experience**
  - Clean, intuitive UI
  - Clear error messages
  - Loading states
  - Success confirmations
  - Back navigation

✓ **Validation**
  - Email format validation
  - Password strength (min 6 chars)
  - Password confirmation matching
  - Token validation on server
