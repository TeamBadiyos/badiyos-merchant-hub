import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Proxies the proof signed-URL service with the caller's own access token. */
export const proofDownloadUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paths: z.array(z.string().min(1)).min(1).max(300) }).parse(d))
  .handler(async ({ data }) => {
    const auth = getRequestHeader("authorization") ?? "";
    const res = await fetch("https://user.badiyos.com/api/public/proof/download-urls", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({ paths: data.paths }),
    });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw new Error("Could not load proof photos. Please try again.");
    return { body: JSON.stringify(body) };
  });
