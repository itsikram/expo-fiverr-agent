# Password Reset Feature - Expo App

This document explains the password reset feature implemented in the Fiverr Agent Expo app.

## Overview

The password reset feature allows users to reset their password if they forget it. The process involves two screens:

1. **Login Screen** - Shows a "Forgot Password?" link on the login tab
2. **Reset Password Screen** - Two-step process to reset the password

## User Flow

### Step 1: Request Password Reset

1. User is on the **Login** screen
2. User clicks **"Forgot Password?"** link
3. Taken to **Reset Password Screen** - Step 1
4. User enters their email address
5. User clicks **"Send Reset Link"**
6. Server sends password reset email with a unique token
7. User receives confirmation message

### Step 2: Reset Password

1. User receives email with password reset link and token
2. Back on **Reset Password Screen** - Step 2
3. User enters:
   - Reset token (copied from email)
   - New password
   - Confirm password
4. User clicks **"Reset Password"**
5. Server validates token and updates password
6. User sees success message and can log in with new password

## Components

### New Files Created

#### `screens/ResetPasswordScreen.js`
- Main password reset screen component
- Two-step form:
  - Step 1: Email entry and reset link request
  - Step 2: Token entry and password reset
- Features:
  - Email validation
  - Password confirmation matching
  - Loading states
  - Success/error messages
  - Back navigation

#### Updated Files

**`screens/AuthScreen.js`**
- Added import for `ResetPasswordScreen`
- Added state variable `showResetPassword`
- Added "Forgot Password?" button in login mode
- Shows `ResetPasswordScreen` when reset is requested

**`utils/authService.js`**
- Added `requestPasswordReset()` - calls `/auth/request-password-reset`
- Added `resetPassword()` - calls `/auth/reset-password`

## API Integration

The app communicates with two new server endpoints:

### Request Password Reset
```
POST /auth/request-password-reset
Body: { email: "user@example.com" }
```

### Reset Password
```
POST /auth/reset-password
Body: { 
  email: "user@example.com",
  token: "reset-token-from-email",
  newPassword: "newsecurepassword"
}
```

## Features

✓ Two-step password reset flow
✓ Email validation
✓ Token validation
✓ Password strength requirements (minimum 6 characters)
✓ Password confirmation matching
✓ Show/hide password toggles
✓ Loading states during API calls
✓ Success and error messages
✓ Back navigation between steps
✓ Responsive design with gradient UI

## Security

- Passwords are hashed server-side using PBKDF2
- Reset tokens expire after 1 hour
- Tokens are validated before password update
- Passwords sent over HTTPS (ensure server uses HTTPS in production)
- No sensitive data stored in local storage except auth token

## How to Test

### Manual Testing Steps

1. **On Login Screen:**
   - Click "Forgot Password?" link
   - Should navigate to Reset Password Screen

2. **Request Reset:**
   - Enter a registered user's email
   - Click "Send Reset Link"
   - Should see success message
   - Check email for password reset link with token

3. **Reset Password:**
   - Copy token from email
   - Enter token in the form
   - Enter new password and confirm it
   - Click "Reset Password"
   - Should see success message
   - Navigate back to login
   - Try logging in with new password

### Edge Cases to Test

- Invalid email (not registered)
- Missing or invalid token
- Password too short (< 6 characters)
- Passwords don't match
- Expired reset token (wait 1 hour or delete token in database)
- Network errors during request

## Styling

The reset password screen uses the same theme as the app:
- Matches existing color scheme and typography
- Gradient background consistent with login screen
- Same card styling and spacing
- Responsive layout for different screen sizes

## Constants Used

From `constants/theme.js`:
- `colors.background.primary` - Main background
- `colors.background.secondary` - Secondary background
- `colors.background.card` - Card background
- `colors.accent.primary` - Primary button color
- `colors.accent.secondary` - Button gradient color
- `colors.text.primary` - Main text color
- `colors.text.secondary` - Secondary text color
- `spacing.lg`, `spacing.md`, `spacing.sm` - Spacing values
- `borderRadius.lg`, `borderRadius.md` - Border radius values
- `typography.sizes`, `typography.weights` - Font sizes and weights

## Notes

- The password reset email is sent by the server (requires email configuration)
- The reset token is valid for 1 hour
- Users can request multiple reset tokens (old ones are replaced)
- Successful password reset clears the reset token
- App redirects to login after successful password reset
