import { useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

const USER_KEY = "ora_user";

export function useAuth() {
  const [user, setUser] = useState(null);   // { id, name, email }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(USER_KEY)
      .then((raw) => {
        if (raw) setUser(JSON.parse(raw));
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (name, email) => {
    // Usa o email como user_id (único e estável)
    const id = email.toLowerCase().trim();
    const userData = { id, name: name.trim(), email: email.toLowerCase().trim() };
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(USER_KEY);
    setUser(null);
  }, []);

  return { user, loading, login, logout };
}
