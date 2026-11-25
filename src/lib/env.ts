/** Public config the browser needs. Fails loudly at startup instead of with a confusing auth error later. */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local (or run `npx vercel env pull .env.local`).");
}

export const env = { supabaseUrl, supabaseAnonKey };
