import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GSTIN_RE } from "./validation";

export const verifyGstin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ gstin: z.string().trim().toUpperCase().regex(GSTIN_RE) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { lookupGstin } = await import("./gstin.server");
    return lookupGstin(data.gstin);
  });
