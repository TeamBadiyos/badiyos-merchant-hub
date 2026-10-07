import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { catalogImageUrls } from "@/lib/catalog-images";

/** Public catalog photo: thumbnail first, then original, then placeholder. */
export function CatalogImage({
  path,
  className = "",
  fallback,
}: {
  path: string | null | undefined;
  className?: string;
  fallback: React.ReactNode;
}) {
  const { thumb, original } = catalogImageUrls(path);
  const [src, setSrc] = useState<string | null>(thumb);
  useEffect(() => setSrc(thumb), [thumb]);

  if (!src) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setSrc(src === thumb && original ? original : null)}
    />
  );
}

export function ProductImage({ path, className = "" }: { path: string | null; className?: string }) {
  return (
    <CatalogImage
      path={path}
      className={`rounded-2xl object-cover ${className}`}
      fallback={
        <div
          className={`flex items-center justify-center rounded-2xl bg-muted text-muted-foreground ${className}`}
        >
          <ImageIcon className="size-5" />
        </div>
      }
    />
  );
}
