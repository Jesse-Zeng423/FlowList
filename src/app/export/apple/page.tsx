"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppFrame } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { APPLE_EXPORT_KEY, parseAppleExportDraft, type AppleExportDraft } from "@/lib/apple-export-draft";
import { appleLibraryRequest, connectAppleMusic } from "@/lib/apple-music-client";
export default function AppleExportPage() {
  const [draft, setDraft] = useState<AppleExportDraft | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { queueMicrotask(() => setDraft(parseAppleExportDraft(window.sessionStorage.getItem(APPLE_EXPORT_KEY)))); }, []);
  const save = (next: AppleExportDraft) => { window.sessionStorage.setItem(APPLE_EXPORT_KEY, JSON.stringify(next)); setDraft(next); };
  const connect = async () => {
    setBusy(true); setError("");
    try { setToken(await connectAppleMusic()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Apple Music connection failed."); }
    finally { setBusy(false); }
  };
  const create = async () => {
    if (!draft || !token || draft.playlistId || busy) return;
    setBusy(true); setError("");
    try {
      const data = await appleLibraryRequest(token, { action: "create", name: draft.name.trim(), tracks: draft.tracks.map(({ id, type }) => ({ id, type })) });
      if (typeof data.playlistId !== "string") throw new Error("Apple Music returned no playlist ID. Check your library before retrying.");
      save({ ...draft, playlistId: data.playlistId });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Apple Music export failed. Check your library before retrying."); }
    finally { setBusy(false); }
  };
  return <AppFrame contentClassName="max-w-3xl"><main className="flow-page-in flex-1 py-8">
    <Link href="/results" className="text-sm text-white/55 hover:text-white">← Results</Link>
    <section className="table-panel mt-4 rounded-xl p-5 sm:p-7">
      <h1 className="flow-display text-3xl text-[#faf1e2]">Save to Apple Music</h1>
      <p className="mt-2 text-sm text-white/58">Review the exact order. A new library playlist is created only when you choose Create playlist.</p>
      {!draft ? <p className="mt-5 text-amber-100">No Apple Music export is ready in this browser session. Return to results.</p> : <>
        <label className="mt-5 block text-sm text-white/70">Playlist name<input value={draft.name} maxLength={120} disabled={!!draft.playlistId} onChange={event => save({ ...draft, name: event.target.value })} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-white" /></label>
        <p className="mt-4 text-xs text-white/45">{draft.tracks.length} Apple Music items · library playlists are private by default; Apple Music may vary by region and subscription.</p>
        <ol className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-lg bg-black/20 p-3 text-sm text-white/70">{draft.tracks.map((track, index) => <li key={`${track.id}-${index}`} className="truncate">{index + 1}. {track.title} — {track.artist}</li>)}</ol>
        {draft.playlistId ? <p className="mt-3 text-emerald-200">Playlist created in your Apple Music library. ID: {draft.playlistId}</p> : null}
        {error ? <p className="mt-3 text-sm text-amber-100" role="alert">{error}</p> : null}
        <div className="mt-5 flex gap-2">{!token && !draft.playlistId ? <Button type="button" disabled={busy} onClick={connect}>{busy ? "Connecting…" : "Connect Apple Music"}</Button> : null}{token && !draft.playlistId ? <Button type="button" disabled={busy || !draft.name.trim()} onClick={create}>{busy ? "Creating…" : "Create playlist"}</Button> : null}</div>
      </>}
    </section>
  </main></AppFrame>;
}
