import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Topic {
  id: string;
  name: string;
}

export interface Pattern {
  id: string;
  name: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  topics: Topic[];
  patterns: Pattern[];
  isHydrated: boolean;
  setAuth: (token: string, user: User) => Promise<void>;
  clearAuth: () => Promise<void>;
  setTaxonomy: (topics: Topic[], patterns: Pattern[]) => void;
  loadTokenFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      topics: [],
      patterns: [],
      isHydrated: false,

      setAuth: async (token: string, user: User) => {
        try {
          await SecureStore.setItemAsync('jwt_token', token);
          set({ token, user });
        } catch (error) {
          console.error('[Store Error] Failed to write secure token:', error);
        }
      },

      clearAuth: async () => {
        try {
          await SecureStore.deleteItemAsync('jwt_token');
          set({ token: null, user: null, topics: [], patterns: [] });
        } catch (error) {
          console.error('[Store Error] Failed to delete secure token:', error);
        }
      },

      setTaxonomy: (topics: Topic[], patterns: Pattern[]) => {
        set({ topics, patterns });
      },

      loadTokenFromStorage: async () => {
        try {
          const token = await SecureStore.getItemAsync('jwt_token');
          set({ token, isHydrated: true });
        } catch (error) {
          console.error('[Store Error] Failed to read secure token:', error);
          set({ token: null, isHydrated: true });
        }
      },
    }),
    {
      name: 'dsa-tracker-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist non-sensitive properties to AsyncStorage (exclude token and hydration state)
      partialize: (state) => ({
        user: state.user,
        topics: state.topics,
        patterns: state.patterns,
      }),
      // Run token SecureStore retrieval after AsyncStorage rehydrates
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('[Store Error] AsyncStorage hydration failed:', error);
          }
          if (state) {
            state.loadTokenFromStorage();
          }
        };
      },
    }
  )
);
