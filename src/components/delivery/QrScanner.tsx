import jsQR from "jsqr";
import { CameraOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDT } from "@/lib/delivery/i18n";

/** Continuous rear-camera QR scanner (getUserMedia). Same value is ignored for 2 seconds. */
export function QrScanner({
  onCode,
  className = "",
  paused = false,
  onFailed,
}: {
  onCode: (text: string) => void;
  className?: string;
  paused?: boolean;
  onFailed?: () => void;
}) {
  const dt = useDT();
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const last = { text: "", at: 0 };
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("2d", { willReadFrequently: true });
    type BD = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const BDC = (window as unknown as { BarcodeDetector?: new (o: object) => BD }).BarcodeDetector;
    let detector: BD | null = null;
    try {
      detector = BDC ? new BDC({ formats: ["qr_code"] }) : null;
    } catch {
      detector = null;
    }

    const emit = (text: string) => {
      const now = Date.now();
      if (text === last.text && now - last.at < 2000) {
        last.at = now;
        return;
      }
      last.text = text;
      last.at = now;
      cb.current(text);
    };

    const tick = async () => {
      if (stopped) return;
      const v = video.current;
      if (v && !pausedRef.current && v.paused) void v.play().catch(() => undefined);
      if (v && v.readyState >= 2 && !pausedRef.current) {
        try {

          if (detector) {
            const r = await detector.detect(v);
            if (r[0]?.rawValue) emit(r[0].rawValue);
          } else if (g) {
            const w = 320;
            const h = Math.round((v.videoHeight / v.videoWidth) * w) || 240;
            canvas.width = w;
            canvas.height = h;
            g.drawImage(v, 0, 0, w, h);
            const img = g.getImageData(0, 0, w, h);
            const r = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (r?.data) emit(r.data);

          }
        } catch {
          /* keep scanning */
        }
      }
      timer = setTimeout(() => void tick(), 200);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
        void tick();
      } catch {
        setFailed(true);
        onFailed?.();
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Some Android WebViews pause the stream when a dialog opens; resume on close.
  useEffect(() => {
    if (paused) return;
    const v = video.current;
    if (v?.paused) void v.play().catch(() => undefined);
  }, [paused]);



  return (
    <div className={`relative overflow-hidden rounded-2xl bg-foreground ${className}`}>
      {failed ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-background">
          <CameraOff className="size-6" />
          {dt("cameraBlocked")}
        </div>
      ) : (
        <>
          <video ref={video} autoPlay playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-primary-foreground/80" />
        </>
      )}
    </div>
  );
}
