import { useEffect, useRef, useState } from "react";

/** Lee un código QR con la cámara trasera. Llama a onCode con el texto leído. */
export function QrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0, stop = false;
    const canvas = document.createElement("canvas");
    (async () => {
      try {
        const jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current!; v.srcObject = stream; await v.play();
        const tick = () => {
          if (stop) return;
          if (v.videoWidth) {
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
            ctx.drawImage(v, 0, 0);
            const r = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            if (r?.data) { stop = true; onCode(r.data); return; }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch { setErr("No se pudo abrir la cámara. Da permiso o escribe el código."); }
    })();
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);

  return (
    <div className="space-y-3">
      <video ref={video} playsInline muted className="aspect-square w-full rounded-2xl bg-muted object-cover" />
      {err && <p className="font-semibold text-destructive">{err}</p>}
      <button type="button" onClick={onClose} className="w-full rounded-2xl bg-secondary py-3 font-bold text-secondary-foreground">Cerrar cámara</button>
    </div>
  );
}
