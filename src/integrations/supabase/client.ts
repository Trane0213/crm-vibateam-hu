import { createClient } from "@supabase/supabase-js";

// Külső Supabase projekt (VIBA-TEAM Kft) — publikus URL + publishable key.
// Service Role Key NEM kerül a frontendre. TODO: ahol szerver oldalra kell, ott külön kezeljük.
export const SUPABASE_URL = "https://uepqejecsiuhodegbcff.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_rSXwIJI7nXcp12wzqOlODw_PLBdBvvs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});