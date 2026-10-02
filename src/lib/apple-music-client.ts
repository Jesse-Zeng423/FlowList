interface MusicKitInstance { authorize(): Promise<string>; musicUserToken?: string; }
interface MusicKitGlobal { configure(config: { developerToken: string; app: { name: string; build: string } }): Promise<MusicKitInstance> | MusicKitInstance; getInstance(): MusicKitInstance; }
declare global { interface Window { MusicKit?: MusicKitGlobal; } }
let scriptPromise: Promise<void> | null = null;
let configuredToken: string | null = null;
export async function connectAppleMusic(): Promise<string> {
  const response = await fetch("/api/apple/token", { cache: "no-store" });
  const data = await response.json() as { configured?: boolean; token?: string; error?: string };
  if (!response.ok || !data.token) throw new Error(data.error || "Apple Music is not configured for this deployment.");
  if (!scriptPromise) scriptPromise = new Promise<void>((resolve, reject) => {
    if (window.MusicKit) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = null; reject(new Error("MusicKit could not load.")); };
    document.head.appendChild(script);
  });
  await scriptPromise;
  const kit = window.MusicKit;
  if (!kit) throw new Error("MusicKit is unavailable in this browser.");
  if (configuredToken !== data.token) {
    await kit.configure({ developerToken: data.token, app: { name: "Flowlist", build: "0.2.0" } });
    configuredToken = data.token;
  }
  const instance = kit.getInstance();
  const token = await instance.authorize();
  const userToken = token || instance.musicUserToken;
  if (!userToken) throw new Error("Apple Music did not return a user token.");
  return userToken;
}
export async function appleLibraryRequest(userToken: string, body: object): Promise<Record<string, unknown>> {
  const response = await fetch("/api/apple/library", { method: "POST", headers: { "Content-Type": "application/json", "Music-User-Token": userToken }, body: JSON.stringify(body) });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok || data.ok !== true) throw new Error(typeof data.error === "string" ? data.error : `Apple Music request failed (${response.status}).`);
  return data;
}
