import axios from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';

// For local development:
// - iOS simulators can connect directly to localhost
// - Android emulators map localhost of host PC to 10.0.2.2
// - Physical devices require configuring host PC's local LAN IP (e.g. http://192.168.1.50:3000)
const DEFAULT_API_URL = Platform.select({
  ios: 'http://localhost:3000',
  android: 'http://10.0.2.2:3000',
  default: 'http://localhost:3000',
});

const baseURL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;

export const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// AI endpoints can be slow: a local model (Ollama on a laptop CPU) may take
// up to the server's OLLAMA_TIMEOUT_MS (150s) before it falls back to rules.
export const AI_REQUEST_TIMEOUT_MS = 180000;

// Which provider produced an AI answer (the `source` field of /ai/* responses).
export type AiSource = 'rules' | 'ollama' | 'anthropic';
export const AI_SOURCE_LABELS: Record<AiSource, string> = {
  rules: 'Smart rules',
  ollama: 'Local AI',
  anthropic: 'Claude',
};

// Device IANA time zone (e.g. "Asia/Kolkata"), sent to endpoints that group by
// calendar day (upcoming revisions, streaks, heatmap). Undefined => server uses UTC.
export const deviceTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

// Request interceptor to automatically attach authorization header
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to catch 401 Unauthorized errors and force log out
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    // If the server returns 401 Unauthorized, automatically log out
    if (error.response && error.response.status === 401) {
      console.warn('[API Interceptor] Received 401 Unauthorized. Clearing auth store...');
      await useAuthStore.getState().clearAuth();
    }
    return Promise.reject(error);
  }
);
