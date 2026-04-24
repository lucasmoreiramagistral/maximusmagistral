// Client-side middleware: reads the current Supabase session from the browser
// and attaches the access token as an `Authorization: Bearer ...` header on
// outgoing server-function fetches. The server middleware
// (`requireSupabaseAuth`) needs this header to validate the user.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    return next({ headers });
  },
);
