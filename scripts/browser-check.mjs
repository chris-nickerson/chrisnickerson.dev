import { mkdir } from "node:fs/promises";

export const previewURL = process.env.BASE_URL || "http://127.0.0.1:4173";
export const devURL = process.env.BASE_URL || "http://127.0.0.1:5173";
export const channel = process.env.BROWSER_CHANNEL || "chromium";
export const captureDir = process.env.CAPTURE_DIR || "evidence/local";
await mkdir(captureDir, { recursive: true });

export async function saveRecording(video, path) {
  await video.saveAs(path);
  await video.delete();
}
