import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { store } from './store/store';
import { logout, setTokens } from './store/slices/authSlice';

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl || 'https://iema-ai-platform.preview.emergentagent.com') + '/api';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = store.getState().auth.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      const refresh = store.getState().auth.refresh_token;
      if (!refresh) { store.dispatch(logout()); return Promise.reject(error); }
      original._retry = true;
      try {
        if (!refreshing) refreshing = axios.post(`${API_BASE}/auth/refresh`, { refresh_token: refresh });
        const { data } = await refreshing;
        refreshing = null;
        store.dispatch(setTokens(data));
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        store.dispatch(logout());
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);

export { API_BASE };
export default api;

// Secure storage helpers
export const persistAuth = async (state) => {
  try {
    if (state.access_token) {
      await SecureStore.setItemAsync('iema_auth', JSON.stringify({
        user: state.user,
        tokens: { access_token: state.access_token, refresh_token: state.refresh_token }
      }));
    } else {
      await SecureStore.deleteItemAsync('iema_auth');
    }
  } catch {}
};

export const loadAuth = async () => {
  try {
    const raw = await SecureStore.getItemAsync('iema_auth');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
