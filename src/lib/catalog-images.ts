import { supabase } from "@/integrations/supabase/client";

/** Public product/shop photos. KYC documents stay in the private merchant-documents bucket. */
export const CATALOG_IMAGES_BASE_URL =
  "https://api.badiyos.com/storage/v1/object/public/catalog-images";

const BUCKET = "catalog-images";

function isHeic(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function toUploadable(file: File): Promise<{ blob: Blob; ext: string; contentType: string }> {
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    if (!blob) throw new Error("HEIC conversion failed");
    return { blob, ext: "jpg", contentType: "image/jpeg" };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  return { blob: file, ext, contentType: file.type || "image/jpeg" };
}

function webpThumbnail(source: Blob, targetWidth = 400): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(source);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const width = Math.min(img.naturalWidth, targetWidth);
      const height = Math.round((img.naturalHeight / img.naturalWidth) * width);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Thumbnail failed"))),
        "image/webp",
        0.82,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

/** Uploads original + 400px WebP thumbnail; returns the relative path to store in the DB. */
export async function uploadCatalogImage(opts: {
  merchantId: string;
  type: "product" | "shop_photo";
  file: File;
}): Promise<string> {
  const { blob, ext, contentType } = await toUploadable(opts.file);
  const path = `${opts.merchantId}/${opts.type}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType });
  if (error) throw error;
  try {
    const thumb = await webpThumbnail(blob);
    const { error: thumbErr } = await supabase.storage
      .from(BUCKET)
      .upload(`_thumbs/${path}.webp`, thumb, { upsert: true, contentType: "image/webp" });
    if (thumbErr) console.warn("Thumbnail upload failed", thumbErr);
  } catch (e) {
    console.warn("Thumbnail generation failed", e);
  }
  return path;
}

export function catalogImageUrls(path: string | null | undefined) {
  if (!path) return { thumb: null, original: null };
  const clean = path.replace(/^\/+/, "");
  return {
    thumb: `${CATALOG_IMAGES_BASE_URL}/_thumbs/${clean}.webp`,
    original: `${CATALOG_IMAGES_BASE_URL}/${clean}`,
  };
}
