import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, CheckCheck, ChevronLeft, ImagePlus, Loader2, MessageCircle, Phone, Plus, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/use-require-auth";

const SUPPORT_NUMBER = "8007444464";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & chat — badiyos Merchant Portal" },
      { name: "description", content: "Chat with badiyos support, send photos, or call and WhatsApp the merchant support team." },
      { property: "og:title", content: "Help & chat — badiyos Merchant Portal" },
      { property: "og:description", content: "Chat, call or WhatsApp badiyos merchant support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SupportPage,
});

const TX = {
  en: { title: "Help & chat", call: "Call", wa: "WhatsApp", newChat: "New chat", chats: "Your chats", empty: "No chats yet",
    typeMsg: "Type a message", subject: "What do you need help with?", start: "Start chat", open: "Open", resolved: "Resolved", support: "badiyos support" },
  mr: { title: "मदत आणि चॅट", call: "कॉल", wa: "WhatsApp", newChat: "नवीन चॅट", chats: "तुमचे चॅट", empty: "अजून चॅट नाहीत",
    typeMsg: "मेसेज लिहा", subject: "तुम्हाला कशासाठी मदत हवी आहे?", start: "चॅट सुरू करा", open: "चालू", resolved: "सोडवले", support: "badiyos सपोर्ट" },
};

type Ticket = { id: string; subject: string | null; message: string; status: string; last_message_at: string | null; created_at: string };
type Msg = { id: string; sender_type: string; body: string | null; created_at: string; seen_at: string | null; attachment_url: string | null };

function SupportPage() {
  const { lang } = useI18n();
  const L = TX[lang === "mr" ? "mr" : "en"];
  const merchant = useRequireAuth();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");

  const tickets = useQuery({
    queryKey: ["support-tickets", merchant?.id],
    enabled: !!merchant,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("support_tickets")
        .select("id, subject, message, status, last_message_at, created_at")
        .eq("user_id", u.user!.id).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data as Ticket[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const text = subject.trim();
      const { data, error } = await supabase.from("support_tickets")
        .insert({ user_id: u.user!.id, subject: text.slice(0, 80), message: text, source: "merchant_app", category: "merchant" })
        .select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => { setSubject(""); setOpenId(id); void qc.invalidateQueries({ queryKey: ["support-tickets"] }); },
    onError: () => toast.error("Could not start the chat."),
  });

  if (!merchant) return null;
  const open = tickets.data?.find((t) => t.id === openId);

  return (
    <AppShell title={L.title} onRefresh={() => tickets.refetch()}>
      {open ? (
        <Chat ticket={open} onBack={() => setOpenId(null)} L={L} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" asChild><a href={`tel:+91${SUPPORT_NUMBER}`}><Phone className="size-4 text-primary" />{L.call}</a></Button>
            <Button variant="outline" asChild><a href={`https://wa.me/91${SUPPORT_NUMBER}`} target="_blank" rel="noreferrer"><MessageCircle className="size-4 text-primary" />{L.wa}</a></Button>
          </div>
          <section className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-sm font-bold">{L.newChat}</p>
            <Input placeholder={L.subject} value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Button className="w-full" disabled={subject.trim().length < 3 || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{L.start}
            </Button>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-bold">{L.chats}</h2>
            {tickets.data?.length === 0 && <p className="text-sm text-muted-foreground">{L.empty}</p>}
            {tickets.data?.map((t) => (
              <button key={t.id} onClick={() => setOpenId(t.id)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-card">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{t.subject || t.message}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.last_message_at ?? t.created_at).toLocaleString()}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.status === "resolved" ? "bg-muted text-muted-foreground" : "bg-primary-soft text-accent-foreground"}`}>
                  {t.status === "resolved" ? L.resolved : L.open}
                </span>
              </button>
            ))}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function Attachment({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void supabase.storage.from("support-attachments").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="mt-1 max-h-56 rounded-lg" /></a> : null;
}

function Chat({ ticket, onBack, L }: { ticket: Ticket; onBack: () => void; L: (typeof TX)["en"] }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const closed = ticket.status === "resolved";

  const msgs = useQuery({
    queryKey: ["support-messages", ticket.id],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("support_ticket_messages")
        .select("id, sender_type, body, created_at, seen_at, attachment_url")
        .eq("ticket_id", ticket.id).eq("is_internal", false).order("created_at").limit(300);
      if (error) throw error;
      return data as Msg[];
    },
  });

  useEffect(() => {
    void supabase.rpc("support_mark_seen_by_user", { _ticket_id: ticket.id });
    endRef.current?.scrollIntoView();
  }, [ticket.id, msgs.data?.length]);

  const send = useMutation({
    mutationFn: async (file?: File) => {
      const { data: u } = await supabase.auth.getUser();
      let path: string | null = null;
      if (file) {
        path = `${ticket.id}/${Date.now()}-${file.name.replace(/[^\w.]/g, "_")}`;
        const { error: up } = await supabase.storage.from("support-attachments").upload(path, file);
        if (up) throw up;
      }
      const { error } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticket.id, sender_type: "customer", sender_id: u.user!.id,
        body: text.trim(), attachment_url: path,
      });
      if (error) throw error;
    },
    onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["support-messages", ticket.id] }); },
    onError: () => toast.error("Message not sent."),
  });

  return (
    <div className="flex min-h-[70vh] flex-col">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-bold text-primary">
        <ChevronLeft className="size-4" />{ticket.subject || L.support}
      </button>
      <div className="flex-1 space-y-2">
        <Bubble mine body={ticket.message} at={ticket.created_at} seen={false} />
        {msgs.data?.map((m) => (
          <Bubble key={m.id} mine={m.sender_type === "customer"} body={m.body} at={m.created_at} seen={!!m.seen_at} path={m.attachment_url} />
        ))}
        <div ref={endRef} />
      </div>
      {!closed && (
        <div className="sticky bottom-0 mt-3 flex items-center gap-2 bg-background py-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) send.mutate(f); e.target.value = ""; }} />
          <Button size="icon" variant="outline" onClick={() => fileRef.current?.click()} aria-label="Photo"><ImagePlus className="size-4" /></Button>
          <Input placeholder={L.typeMsg} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) send.mutate(undefined); }} />
          <Button size="icon" disabled={!text.trim() || send.isPending} onClick={() => send.mutate(undefined)} aria-label="Send">
            {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

function Bubble({ mine, body, at, seen, path }: { mine: boolean; body: string | null; at: string; seen: boolean; path?: string | null }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"}`}>
        {path && <Attachment path={path} />}
        {body && <p className="whitespace-pre-wrap">{body}</p>}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-75">
          {new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {mine && (seen ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
        </p>
      </div>
    </div>
  );
}
