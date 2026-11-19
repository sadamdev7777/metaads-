import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The Supabase client, or null when the environment variables are not set.
 * With no client the app runs in demo mode: sample data, local sign-in,
 * and an activity log kept in the browser only.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export const supabaseConfigured = supabase !== null;
