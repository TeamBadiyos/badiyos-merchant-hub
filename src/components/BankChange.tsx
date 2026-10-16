import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { useI18n } from "@/lib/i18n";

const TX = {
  en: {
    change: "Change bank", title: "New bank account", holder: "Account holder name", acc: "Account number", acc2: "Re-enter account number",
    ifsc: "IFSC", proof: "Photo of cancelled cheque / passbook", mismatch: "Account numbers don't match", sendOtp: "Send OTP on WhatsApp",
    otp: "Enter OTP", sentTo: "OTP sent to ••••", submit: "Confirm & submit", submitted: "Sent to badiyos for approval",
    note: "Your current bank stays in use until badiyos approves the new one.", pending: "Pending approval", approved: "Approved", rejected: "Rejected",
    reason: "Reason", invalid: "Fill all fields correctly",
  },
  mr: {
    change: "बँक बदला", title: "नवीन बँक खाते", holder: "खातेधारकाचे नाव", acc: "खाते क्रमांक", acc2: "खाते क्रमांक पुन्हा टाका",
    ifsc: "IFSC", proof: "रद्द चेक / पासबुकचा फोटो", mismatch: "खाते क्रमांक जुळत नाहीत", sendOtp: "WhatsApp वर OTP पाठवा",
    otp: "OTP टाका", sentTo: "OTP पाठवला ••••", submit: "पुष्टी करा व पाठवा", submitted: "मंजुरीसाठी badiyos कडे पाठवले",
    note: "नवीन खाते मंजूर होईपर्यंत सध्याचे बँक खाते वापरले जाईल.", pending: "मंजुरी बाकी", approved: "मंजूर", rejected: "नाकारले",
    reason: "कारण", invalid: "सर्व माहिती योग्य भरा",
  },
} as const;

type Req = { id: string; status: string; account_number: string; ifsc: string; rejection_reason: string | null; created_at: string };

export function BankChange({ storeId }: { storeId: string }) {
  const { lang } = useI18n();
  const L = TX[lang === "mr" ? "mr" : "en"];
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [holder, setHolder] = useState("");
  const [acc, setAcc] = useState("");
  const [acc2, setAcc2] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const last = useQuery({
    queryKey: ["money", "bank-request", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("merchant_bank_change_requests" as never)
        .select("id,status,account_number,ifsc,rejection_reason,created_at").eq("merchant_id", storeId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as Req | null;
    },
  });
  const r = last.data;
  const pending = r?.status === "pending";

  const valid = holder.trim().length >= 2 && /^[0-9]{9,18}$/.test(acc) && acc === acc2 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) && file;

  const sendOtp = async () => {
    if (!valid) { toast.error(acc !== acc2 ? L.mismatch : L.invalid); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("merchant_bank_change_request_otp" as never, { _store_id: storeId } as never);
      if (error) throw error;
      setSentTo((data as { sent_to: string }).sent_to);
    } catch (e) { toast.error(friendlyErrorMessage(e)); } finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const ext = (file!.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${storeId}/bank_change-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("merchant-documents").upload(path, file!, { contentType: file!.type || "image/jpeg" });
      if (up.error) throw up.error;
      const { error } = await supabase.rpc("merchant_bank_change_submit" as never, {
        _store_id: storeId, _holder: holder.trim(), _account: acc, _ifsc: ifsc, _proof_path: path, _otp: otp.trim(),
      } as never);
      if (error) throw error;
      toast.success(L.submitted);
      setOpen(false); setSentTo(null); setOtp(""); setAcc(""); setAcc2(""); setFile(null);
      await qc.invalidateQueries({ queryKey: ["money", "bank-request", storeId] });
    } catch (e) { toast.error(friendlyErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <>
      {r && (
        <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${r.status === "pending" ? "bg-warning/15 text-foreground" : r.status === "approved" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
          <p className="num">{r.status === "pending" ? L.pending : r.status === "approved" ? L.approved : L.rejected} · •••• {r.account_number.slice(-4)} · {r.ifsc}</p>
          {r.status === "rejected" && r.rejection_reason && <p className="mt-0.5">{L.reason}: {r.rejection_reason}</p>}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{L.note}</p>
      <Button variant="outline" className="mt-2 w-full rounded-xl" disabled={pending} onClick={() => setOpen(true)}>{L.change}</Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader><SheetTitle>{L.title}</SheetTitle></SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            {!sentTo ? (
              <>
                <Input placeholder={L.holder} value={holder} onChange={(e) => setHolder(e.target.value)} />
                <Input inputMode="numeric" placeholder={L.acc} value={acc} onChange={(e) => setAcc(e.target.value.replace(/\D/g, ""))} />
                <Input inputMode="numeric" placeholder={L.acc2} value={acc2} onChange={(e) => setAcc2(e.target.value.replace(/\D/g, ""))} onPaste={(e) => e.preventDefault()} />
                {acc2 && acc !== acc2 && <p className="text-xs font-semibold text-destructive">{L.mismatch}</p>}
                <Input placeholder={L.ifsc} value={ifsc} maxLength={11} onChange={(e) => setIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
                <label className="block text-xs font-semibold text-muted-foreground">{L.proof}
                  <Input type="file" accept="image/*,application/pdf" capture="environment" className="mt-1" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <Button className="h-12 w-full rounded-xl font-bold" disabled={busy || !valid} onClick={() => void sendOtp()}>
                  {busy && <Loader2 className="size-4 animate-spin" />}{L.sendOtp}
                </Button>
              </>
            ) : (
              <>
                <p className="num text-sm text-muted-foreground">{L.sentTo}{sentTo}</p>
                <Input inputMode="numeric" maxLength={6} placeholder={L.otp} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
                <Button className="h-12 w-full rounded-xl font-bold" disabled={busy || otp.length < 4} onClick={() => void submit()}>
                  {busy && <Loader2 className="size-4 animate-spin" />}{L.submit}
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
