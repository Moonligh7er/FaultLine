import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { LargeSecureStore, isEncryptionAvailable } from './secureStorage';

const extra = Constants.expoConfig?.extra || {};

const SUPABASE_URL = extra.supabaseUrl || '';
const SUPABASE_ANON_KEY = extra.supabaseAnonKey || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase credentials missing — check .env and app.config.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Session tokens are AES-encrypted at rest with a key held in the OS
    // keystore (services/secureStorage.ts). Web has no keystore.
    storage: isEncryptionAvailable() ? LargeSecureStore : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // Magic links return ?code=, exchanged in services/authLinking.ts
    flowType: 'pkce',
  },
});
