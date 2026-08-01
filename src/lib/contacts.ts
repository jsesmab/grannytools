export type Contact = { name: string; phone: string; photo?: string };

export const CONTACTS_KEY = "grannytools.contacts";
const LEGACY_KEYS = ["grammytools.contacts", "yayoutil.panic.contacts"];
export const MAX_CONTACTS = 24;

export function loadContacts(): Contact[] {
  try {
    const raw =
      localStorage.getItem(CONTACTS_KEY) ??
      LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ??
      null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Contact[]) : [];
  } catch {
    return [];
  }
}

export function saveContactsToStorage(next: Contact[]) {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export async function capturePhoto(facing: "user" | "environment" = "user"): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: false,
    });
    const video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 400));
    const size = 480;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const vw = video.videoWidth,
      vh = video.videoHeight;
    const s = Math.min(vw, vh);
    ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, size, size);
    stream.getTracks().forEach((t) => t.stop());
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch (e) {
    console.error(e);
    return null;
  }
}

export function callPhone(phone: string) {
  window.location.href = `tel:${phone.replace(/\s+/g, "")}`;
}
