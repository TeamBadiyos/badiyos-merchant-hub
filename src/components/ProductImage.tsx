import { useQuery } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

/** Product photos live in a private bucket, so thumbnails use short-lived signed URLs. */
export function ProductImage({ path, className = "" }: { path: string | null; className?: string }) {
  const { data } = useQuery({
    queryKey: ["product-image", path],
    enabled: Boolean(path),
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage
        .from("product-images")
        .createSignedUrl(path!, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });

  if (!path || !data) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl bg-muted text-muted-foreground ${className}`}
      >
        <ImageIcon className="size-5" />
      </div>
    );
  }
  return <img src={data} alt="" className={`rounded-2xl object-cover ${className}`} loading="lazy" />;
}
