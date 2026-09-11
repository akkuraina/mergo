import { createClient } from "@supabase/supabase-js";

export function createClerkSupabaseClient(
  getToken: () => Promise<string | null>
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase client environment variables");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => {
      const token = await getToken();
      return token ?? null;
    },
  });
}
