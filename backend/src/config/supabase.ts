import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { getMockClient } from '../mock/client.js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    if (env.useMock) {
      // El mock imita la superficie usada por la app; se tipa como SupabaseClient
      // para no tocar los módulos, pero en runtime solo exponen los métodos usados.
      client = getMockClient() as unknown as SupabaseClient;
    } else {
      client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }
  return client;
}
