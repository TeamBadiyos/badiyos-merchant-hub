import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { CSV_TEMPLATE, mapRows, parseCsv, type ParsedRow } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";
import { inr } from "@/lib/order-status";

export function CsvImportDialog({
  merchantId,
  onClose,
}: {
  merchantId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);

  const valid = rows.filter((r) => r.errors.length === 0);
  const invalid = rows.filter((r) => r.errors.length > 0);

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "badiyos-products-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file: File) => {
    const text = await file.text();
    const parsed = mapRows(parseCsv(text), {
      name: t("csvErrName"),
      price: t("csvErrPrice"),
      stock: t("csvErrStock"),
    });
    if (!parsed.length) toast.error(t("csvEmpty"));
    setRows(parsed);
  };

  const importRows = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert(
        valid.map((row) => ({
          merchant_id: merchantId,
          name: row.name,
          description: row.description,
          category_label: row.category_label,
          price: row.price,
          stock_quantity: row.stock_quantity,
          unit: row.unit,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${t("csvDone")}: ${valid.length} ✓ · ${invalid.length} ✕`);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (error: Error) => {
      console.error(error);
      toast.error("Import failed. Please check your file and try again.");
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>{t("importCsv")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Button variant="outline" className="w-full rounded-xl" onClick={downloadTemplate}>
            <Download className="size-4" />
            {t("downloadTemplate")}
          </Button>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="size-4" />
            {t("csvChooseFile")}
          </Button>

          {rows.length > 0 && (
            <>
              <div className="num flex flex-wrap gap-3 text-xs font-bold">
                <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                  {rows.length} {t("csvRows")}
                </span>
                <span className="rounded-full bg-primary-soft px-3 py-1 text-primary">
                  {valid.length} {t("csvValid")}
                </span>
                {invalid.length > 0 && (
                  <span className="rounded-full bg-destructive/10 px-3 py-1 text-destructive">
                    {invalid.length} {t("csvInvalid")}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {rows.map((row) => (
                  <div
                    key={row.index}
                    className={`rounded-xl border p-3 text-xs ${
                      row.errors.length
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {row.errors.length ? (
                        <AlertTriangle className="size-4 shrink-0 text-destructive" />
                      ) : (
                        <CheckCircle2 className="size-4 shrink-0 text-primary" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-foreground">
                          {row.name || `Row ${row.index}`}
                        </p>
                        <p className="num font-semibold text-muted-foreground">
                          {inr(row.price)} · {t("stock")}: {row.stock_quantity} · {row.unit}
                        </p>
                        {row.errors.length > 0 && (
                          <p className="font-bold text-destructive">{row.errors.join(" · ")}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              className="flex-1 rounded-xl font-bold"
              disabled={valid.length === 0 || importRows.isPending}
              onClick={() => importRows.mutate()}
            >
              {importRows.isPending && <Loader2 className="size-4 animate-spin" />}
              {t("csvConfirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
