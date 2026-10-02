"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { parseYouTubeExportDraft, type YouTubeExportDraft, type YouTubePrivacy, YOUTUBE_EXPORT_KEY } from "@/lib/youtube-export-draft";

type AuthStatus = { configured: boolean; authorized: boolean };

async function postExport(body: object): Promise<Record<string, unknown>> {
  const response = await fetch("/api/youtube/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json() as Record<string, unknown>;
  if (!response.ok || json.ok !== true) throw new Error(typeof json.error === "string" ? json.error : `Request failed (${response.status}).`);
  return json;
}

export default function YouTubeExportPage() {
  const [draft, setDraft] = useState<YouTubeExportDraft | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(() => setDraft(parseYouTubeExportDraft(window.sessionStorage.getItem(YOUTUBE_EXPORT_KEY))));
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) queueMicrotask(() => setError(code === "not_configured" ? "Google OAuth is not configured for this deployment." : "YouTube authorization did not complete. Try connecting again."));
    fetch("/api/youtube/oauth/status").then(r => r.json()).then((value: AuthStatus) => setAuth(value)).catch(() => setError("Could not check YouTube connection."));
  }, []);

  const save = (next: YouTubeExportDraft) => {
    window.sessionStorage.setItem(YOUTUBE_EXPORT_KEY, JSON.stringify(next));
    setDraft(next);
  };

  const createOrResume = async () => {
    if (!draft || !auth?.authorized || busy) return;
    setBusy(true);
    setError("");
    let current = draft;
    try {
      if (!current.playlistId) {
        const created = await postExport({ action: "create", title: current.title.trim(), privacy: current.privacy });
        if (typeof created.playlistId !== "string") throw new Error("YouTube did not return a playlist ID.");
        current = { ...current, playlistId: created.playlistId };
        save(current);
      }
      for (let i = current.nextIndex; i < current.tracks.length; i++) {
        await postExport({ action: "append", playlistId: current.playlistId, videoId: current.tracks[i]!.videoId, index: i });
        current = { ...current, nextIndex: i + 1 };
        save(current);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export paused. Retry to continue.");
      if (/authorization expired|connect your youtube/i.test(String(cause))) setAuth(previous => previous ? { ...previous, authorized: false } : previous);
    } finally { setBusy(false); }
  };

  return <AppFrame contentClassName="max-w-3xl">
    <main className="flow-page-in flex-1 py-8">
      <Link href="/results" className="text-sm text-white/55 hover:text-white">← Results</Link>
      <section className="table-panel mt-4 rounded-xl p-5 sm:p-7">
        <h1 className="flow-display text-3xl text-[#faf1e2]">Save to YouTube</h1>
        <p className="mt-2 text-sm text-white/58">Review the exact order and privacy setting. A new playlist is created only when you choose Create playlist.</p>
        {!draft ? <p className="mt-5 text-amber-100">No export is ready in this browser session. Return to results and choose Save to YouTube.</p> : <>
          <label className="mt-5 block text-sm text-white/70">Playlist title
            <input value={draft.title} maxLength={120} disabled={!!draft.playlistId} onChange={event => save({ ...draft, title: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" />
          </label>
          <label className="mt-4 block text-sm text-white/70">Privacy
            <select value={draft.privacy} disabled={!!draft.playlistId} onChange={event => save({ ...draft, privacy: event.target.value as YouTubePrivacy })} className="mt-1 block rounded-lg border border-white/15 bg-[#14241e] px-3 py-2 text-white">
              <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
            </select>
          </label>
          <p className="mt-4 text-xs text-white/45">{draft.tracks.length} videos · approximately {(draft.tracks.length + 1) * 50} YouTube write quota units. YouTube quota and access may vary.</p>
          <ol className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-lg bg-black/20 p-3 text-sm text-white/70">
            {draft.tracks.map((track, index) => <li key={`${track.videoId}-${index}`} className="truncate">{index + 1}. {track.title} — {track.artist}{index < draft.nextIndex ? " ✓" : ""}</li>)}
          </ol>
          {draft.playlistId ? <p className="mt-3 text-sm text-white/70">Saved {draft.nextIndex}/{draft.tracks.length}. <a className="text-[#bdd5ca] underline" href={`https://www.youtube.com/playlist?list=${draft.playlistId}`} target="_blank" rel="noopener noreferrer">Open playlist</a></p> : null}
          {error ? <p className="mt-3 text-sm text-amber-100" role="alert">{error}</p> : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {auth?.configured && !auth.authorized ? <Button type="button" onClick={() => window.location.assign("/api/youtube/oauth/start")}>Connect YouTube account</Button> : null}
            {auth?.authorized && draft.nextIndex < draft.tracks.length ? <Button type="button" disabled={busy || (!draft.playlistId && !draft.title.trim())} onClick={createOrResume}>{busy ? `Saving ${draft.nextIndex}/${draft.tracks.length}…` : draft.playlistId ? "Resume export" : "Create playlist"}</Button> : null}
            {draft.nextIndex === draft.tracks.length ? <p className="text-emerald-200">Playlist complete.</p> : null}
          </div>
          {auth && !auth.configured ? <p className="mt-3 text-xs text-amber-100">Google OAuth credentials and redirect URI must be configured by the project owner before this feature can connect.</p> : null}
        </>}
      </section>
    </main>
  </AppFrame>;
}
