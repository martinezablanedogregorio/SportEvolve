import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient } from '@supabase/supabase-js';

// Supabase publishable credentials are designed to be embedded in client apps.
// RLS remains the security boundary; never place a service-role/secret key here.
const supabaseUrl = 'https://ilbbxjndpccngmxrgiby.supabase.co';
const supabasePublishableKey = 'sb_publishable_tSJZjJlVsUf2cK7jeg0PtQ_1Qa0aX1p';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
