import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Temporary #119 control A: the SDK default persists Auth in localStorage,
// which iOS should not copy when installing the Home Screen web app.
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
