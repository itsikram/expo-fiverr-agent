import React, { createContext, useContext, useEffect, useState } from "react";
import {
  authLogin,
  authRegister,
  authMe,
  authLogout } from
"../utils/authService";
import { saveAuthData, loadAuthData, clearAuthData } from "../utils/storage";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({
    token: null,
    username: null,
    email: null,
    role: "user"
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const savedAuth = await loadAuthData();
        if (savedAuth?.token) {
          // Restore cached auth immediately so the WebSocket can connect while
          // authMe verifies the token in the background.
          setAuth({
            token: savedAuth.token,
            username: savedAuth.username || null,
            email: savedAuth.email || null,
            role: savedAuth.role || "user"
          });
          setIsAuthenticated(true);
          setIsAuthReady(true);

          try {
            const user = await authMe(savedAuth.token);
            setAuth({
              token: savedAuth.token,
              username: user.username || savedAuth.username || null,
              email: user.email || savedAuth.email || null,
              role: user.role || savedAuth.role || "user"
            });
          } catch (error) {
            await clearAuthData();
            setAuth({ token: null, username: null, email: null, role: "user" });
            setIsAuthenticated(false);
          }
          return;
        }
      } catch (error) {
        setAuthError(error.message || "Failed to initialize auth");
        setAuth({ token: null, username: null, email: null, role: "user" });
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
        role: result.role || "user"
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
        role: result.role || "user"
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

    }
    await clearAuthData();
    setAuth({ token: null, username: null, email: null, role: "user" });
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        token: auth.token,
        username: auth.username,
        email: auth.email,
        role: auth.role,
        isAuthenticated,
        isAuthReady,
        authError,
        login,
        register,
        logout
      }}>
      
      {children}
    </AuthContext.Provider>);

};