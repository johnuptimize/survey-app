"use client";

/**
 * Prolific appends PROLIFIC_PID / STUDY_ID / SESSION_ID to the study URL as
 * query params (via placeholder tokens configured on the study). This module
 * reads them on landing, carries them across the client-side navigation from
 * `/` to `/outcome/<pattern>`, and formats them for the logged response row.
 */
export interface ProlificParams {
  prolificPid: string;
  studyId: string;
  sessionId: string;
}

export const EMPTY_PROLIFIC_PARAMS: ProlificParams = {
  prolificPid: "",
  studyId: "",
  sessionId: "",
};

function clean(v: string | null): string {
  return (v ?? "").trim().slice(0, 100);
}

/** Read the three params from a query string (e.g. window.location.search). */
export function readProlificParams(search: string): ProlificParams {
  const sp = new URLSearchParams(search);
  return {
    prolificPid: clean(sp.get("PROLIFIC_PID")),
    studyId: clean(sp.get("STUDY_ID")),
    sessionId: clean(sp.get("SESSION_ID")),
  };
}

export function hasProlificParams(p: ProlificParams): boolean {
  return p.prolificPid !== "" || p.studyId !== "" || p.sessionId !== "";
}

/** "?PROLIFIC_PID=...&..." (or "" if none) — append to an internal link/route. */
export function prolificQueryString(p: ProlificParams): string {
  const sp = new URLSearchParams();
  if (p.prolificPid) sp.set("PROLIFIC_PID", p.prolificPid);
  if (p.studyId) sp.set("STUDY_ID", p.studyId);
  if (p.sessionId) sp.set("SESSION_ID", p.sessionId);
  const s = sp.toString();
  return s ? `?${s}` : "";
}
