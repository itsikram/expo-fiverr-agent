# Quick Start: Password Reset Feature

## What's New

A complete password reset feature has been added to both the Expo app and the server.

**On the Expo App:**
- ✓ "Forgot Password?" link on login screen
- ✓ Two-step password reset process
- ✓ Reset token entry
- ✓ New password confirmation

**On the Server:**
- ✓ Password reset endpoints
- ✓ Email sending capability
- ✓ Secure token generation and validation

## Quick Setup (5 minutes)

### Step 1: Configure Email (Server)

Edit `.env` file in `fiverr-server/` directory:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourapp.com
FRONTEND_URL=http://localhost:3000
```

> **For Gmail:** Get app password from https://myaccount.google.com/apppasswords
> See `fiverr-server/EMAIL_SETUP.md` for detailed instructions

### Step 2: Install Nodemailer

```bash
cd fiverr-server
npm install nodemailer
```

### Step 3: Restart Server

```bash
npm run dev
```

You should see:
```
[Email] ✓ Email service configured and ready
```

## How to Use

### User Flow:

1. **On Login Screen:**
   - Click "Forgot Password?" link
   - See Reset Password Screen

2. **Request Reset:**
   - Enter email address
   - Click "Send Reset Link"
   - Wait for email

3. **Check Email:**
   - Find password reset email
   - Copy the token from the email

4. **Reset Password:**
   - Paste token in the form
   - Enter new password
   - Confirm password
   - Click "Reset Password"
   - Success! ✓

5. **Login with New Password**

## Files Changed

### Expo App
- **New:** `screens/ResetPasswordScreen.js`
- **Modified:** `screens/AuthScreen.js`
- **Modified:** `utils/authService.js`
- **New:** `PASSWORD_RESET.md` (detailed docs)
- **New:** `RESET_PASSWORD_FLOW.md` (flow diagrams)

### Server
- **New:** `src/services/EmailService.js`
- **Modified:** `src/models/User.js`
- **Modified:** `src/controllers/authController.js`
- **Modified:** `src/routes/authRoutes.js`
- **New:** `PASSWORD_RESET.md` (server docs)
- **New:** `EMAIL_SETUP.md` (email setup guide)

## API Endpoints

```
POST /auth/request-password-reset
POST /auth/reset-password
```

See `PASSWORD_RESET.md` for full API documentation.

## Troubleshooting

### Email not sending?

Check these:
1. EMAIL_USER and EMAIL_PASSWORD are set in .env
2. For Gmail, using app password (not regular password)
3. Server restarted after updating .env

See `EMAIL_SETUP.md` for detailed troubleshooting.

### Reset token expired?

Tokens expire after 1 hour. User needs to request a new one.

### Can't reset password?

Check:
1. Token is copied correctly from email
2. Passwords match
3. Password is at least 6 characters

## Features

✅ Two-step secure process
✅ Email verification
✅ 1-hour token expiration
✅ PBKDF2 password hashing
✅ Unique salt per user
✅ Password confirmation
✅ Loading states
✅ Error messages
✅ Responsive UI

## Next Steps

1. ✓ Configure email credentials in `.env`
2. ✓ Run `npm install nodemailer` 
3. ✓ Restart server
4. ✓ Test from Expo app login screen

## Need Help?

- **Email issues:** See `fiverr-server/EMAIL_SETUP.md`
- **Password reset docs:** See `PASSWORD_RESET.md`
- **Flow diagrams:** See `RESET_PASSWORD_FLOW.md`
- **API reference:** See `fiverr-server/PASSWORD_RESET.md`
