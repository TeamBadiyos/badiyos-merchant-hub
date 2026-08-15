import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export type DocType =
  | "aadhaar"
  | "pan"
  | "gst_certificate"
  | "shop_license"
  | "cancelled_cheque"
  | "shop_photo";

type Props = {
  merchantId: string;
  docType: DocType;
  label: string;
  optional?: boolean;
  existingUrl?: string | null;
  onUploaded: (path: string) => void | Promise<void>;
};

export function DocumentUpload({
  merchantId,
  docType,
  label,
  optional = false,
  existingUrl,
  onUploaded,
}: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(Boolean(existingUrl));

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Please upload a file smaller than 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${merchantId}/${docType}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("merchant-documents")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) {
        console.error(error);
        toast.error("Upload failed. Please try again.");
        return;
      }
      await onUploaded(path);
      setDone(true);
      toast.success(`${label} ${t("uploaded").toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{label}</p>
        {optional && (
          <p className="text-xs font-semibold text-muted-foreground">{t("optional")}</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
          done
            ? "bg-primary-soft text-accent-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <Upload className="size-4" />
        )}
        {done ? t("uploaded") : t("upload")}
      </button>
    </div>
  );
}
