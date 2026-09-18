"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase-cookie";

let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const configuredURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = typeof window === "undefined" ? configuredURL : window.location.origin;

  if (!url || !key) {
    throw new Error("Thiếu cấu hình Supabase public.");
  }

  browserClient ??= createBrowserClient(url, key, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
  });
  return browserClient;
}
