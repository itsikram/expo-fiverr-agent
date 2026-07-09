import React, { createContext, useContext, useEffect, useState } from 'react';
import { authLogin, authRegister, authMe, authLogout } from '../utils/authService';
import { saveAuthData, loadAuthData, clearAuthData } from '../utils/storage';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({ token: null, username: null, email: null });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const savedAuth = await loadAuthData();
        if (savedAuth?.token) {
          try {
            const user = await authMe(savedAuth.token);
            setAuth({
              token: savedAuth.token,
              username: user.username || savedAuth.username || null,
              email: user.email || savedAuth.email || null,
            });
            setIsAuthenticated(true);
          } catch (error) {
            console.warn('[AuthContext] Stored token validation failed:', error.message);
            await clearAuthData();
            setAuth({ token: null, username: null, email: null });
            setIsAuthenticated(false);
          }
        }
      } catch (error) {
        console.error('[AuthContext] Error initializing auth:', error);
        setAuthError(error.message || 'Failed to initialize auth');
        setAuth({ token: null, username: null, email: null });
        setIsAuthenticated(false);
      } finally {
        setIsAuthReady(true);
      }
    };

    initializeAuth();
  }, []);

  const login = async ({ email, password }) => {
    try {
      const result = await authLogin({ email, password });
      const authData = {
        token: result.token,
        username: result.username,
        email: result.email,
      };
      await saveAuthData(authData);
      setAuth(authData);
      setIsAuthenticated(true);
      setAuthError(null);
      return result;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const register = async ({ username, email, password }) => {
    try {
      const result = await authRegister({ username, email, password });
      const authData = {
        token: result.token,
        username: result.username,
        email: result.email,
      };
      await saveAuthData(authData);
      setAuth(authData);
      setIsAuthenticated(true);
      setAuthError(null);
      return result;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (auth.token) {
        await authLogout(auth.token);
      }
    } catch (error) {
      console.warn('[AuthContext] Logout request failed:', error.message);
    }
    await clearAuthData();
    setAuth({ token: null, username: null, email: null });
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        token: auth.token,
        username: auth.username,
        email: auth.email,
        isAuthenticated,
        isAuthReady,
        authError,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
