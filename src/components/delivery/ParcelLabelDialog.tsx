import { Download, Loader2, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TripInfo } from "@/lib/delivery/api";
import { useDT } from "@/lib/delivery/i18n";
import {
  downloadParcelLabels,
  parcelLabelsFromTrips,
  printParcelLabels,
  readLabelFormat,
  saveLabelFormat,
  type LabelFormat,
} from "@/lib/delivery/labels";

type ParcelLabelDialogProps = {
  trips: TripInfo[];
  title: string;
  className?: string;
};

export function ParcelLabelDialog({ trips, title, className }: ParcelLabelDialogProps) {
  const dt = useDT();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<LabelFormat>(() => readLabelFormat());
  const [busy, setBusy] = useState<"print" | "download" | null>(null);
  const labelResult = useMemo(() => {
    try {
      return { labels: parcelLabelsFromTrips(trips), error: null };
    } catch (error) {
      return { labels: [], error };
    }
  }, [trips]);
  const { labels } = labelResult;

  if (labels.length === 0 || labelResult.error) return null;

  const chooseFormat = (value: LabelFormat) => {
    setFormat(value);
    saveLabelFormat(value);
  };

  const run = async (action: "print" | "download") => {
    setBusy(action);
    try {
      if (action === "print") await printParcelLabels(labels, format, title);
      else await downloadParcelLabels(labels, format, title);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dt("labelPrintFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={className}>
          <Printer className="size-4" />
          {dt("printLabels")}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] rounded-xl">
        <DialogHeader>
          <DialogTitle>{dt("parcelLabels")}</DialogTitle>
          <DialogDescription>{labels.length} {dt("labelsReady")}</DialogDescription>
        </DialogHeader>
        <Select value={format} onValueChange={(value) => chooseFormat(value as LabelFormat)}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="thermal">{dt("labelThermal")}</SelectItem>
            <SelectItem value="a4">{dt("labelA4")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className="h-11" disabled={busy !== null} onClick={() => void run("print")}>
            {busy === "print" ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            {dt("print")}
          </Button>
          <Button type="button" variant="outline" className="h-11" disabled={busy !== null} onClick={() => void run("download")}>
            {busy === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {dt("downloadPdf")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}