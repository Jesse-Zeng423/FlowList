import { NextRequest, NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/read-bounded-json";
export const runtime = "nodejs";
function fail(error: string, status: number) { return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: NextRequest) {
  const base = process.env.FEEDBACK_SUPABASE_URL?.trim();
  const key = process.env.FEEDBACK_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base || !key || !/^https:\/\/[A-Za-z0-9.-]+\.supabase\.co\/?$/.test(base)) return fail("Feedback collection is not configured. Your rating remains in this browser.", 503);
  let row: Record<string, unknown>;
  try { const input = await readBoundedJson(request, 2048); if (!input || typeof input !== "object" || Array.isArray(input)) return fail("Invalid rating.", 400); row = input as Record<string, unknown>; }
  catch { return fail("Invalid rating.", 400); }
  const { evaluationId, rating, playlistTypeId, flowKeywordIds, source, fromEnergy, toEnergy, fromRhythm, toRhythm, fromConfidence, toConfidence } = row;
  if (typeof evaluationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evaluationId) || !["smooth", "jarring", "unsure"].includes(String(rating)) || typeof playlistTypeId !== "string" || playlistTypeId.length > 80 || !Array.isArray(flowKeywordIds) || flowKeywordIds.length > 3 || !flowKeywordIds.every(value => typeof value === "string" && value.length <= 80) || typeof source !== "string" || !["youtube", "apple", "spotify", "manual", "demo"].includes(source) || ![fromEnergy, toEnergy, fromRhythm, toRhythm].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100) || ![fromConfidence, toConfidence].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)) return fail("Invalid rating.", 400);
  const safeRow = { evaluation_id: evaluationId, rating, playlist_type_id: playlistTypeId, flow_keyword_ids: flowKeywordIds, source, from_energy: fromEnergy, to_energy: toEnergy, from_rhythm: fromRhythm, to_rhythm: toRhythm, from_confidence: fromConfidence, to_confidence: toConfidence };
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/transition_feedback?on_conflict=evaluation_id`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(safeRow), cache: "no-store" });
    return response.ok ? NextResponse.json({ ok: true }) : fail("Feedback server is unavailable. Your rating remains in this browser.", 502);
  } catch { return fail("Feedback server is unavailable. Your rating remains in this browser.", 502); }
}
