"use client";

import { useEffect, useRef, useState } from "react";
import type { LuckReport } from "@/domain/nufflizer/types";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { readAnalysisResponse } from "@/lib/readAnalysisResponse";

export function ReplayUploadPanel({
  onReport,
  onReset,
  hasReport,
  onDownload
}: {
  onReport: (report: LuckReport) => void;
  onReset: () => void;
  hasReport: boolean;
  onDownload: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(
    () => () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    },
    []
  );

  function selectFiles(files: FileList | null) {
    if (busy) return;
    setStatus(null);
    setError(null);
    setFile(null);
    const next = files?.[0];
    if (!next) return;
    if (files.length !== 1) {
      setError("Choose one replay at a time.");
    } else if (!/\.(xml|bbr)$/i.test(next.name)) {
      setError("Choose a Blood Bowl 3 replay ending in .xml or .bbr.");
    } else if (next.size === 0) {
      setError("This file is empty. Choose another replay.");
    } else if (next.size > REPLAY_LIMITS.inputBytes) {
      setError("Replay file too large. Maximum size is 4 MB.");
    } else {
      setFile(next);
    }
  }

  function cancel() {
    const controller = activeRequest.current;
    activeRequest.current = null;
    controller?.abort();
    setBusy(false);
    setStatus("Analysis cancelled. You can retry or choose another replay.");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current) return;
    if (!file) {
      setError("Choose a replay file first.");
      inputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError(null);
    setStatus("Reading replay and rolling Nufflizier...");
    onReset();
    const data = new FormData();
    data.append("replay", file);
    try {
      const response = await fetch("/api/nufflizier/analyze", {
        method: "POST",
        body: data,
        signal: controller.signal
      });
      const report = await readAnalysisResponse(response);
      if (activeRequest.current !== controller) return;
      onReport(report);
      setStatus("Analysis complete. Review the evidence limits below.");
    } catch (cause) {
      if (activeRequest.current !== controller) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Analysis failed. Please try again."
      );
      setStatus(null);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  const buttonClass =
    "rounded-lg border border-amber-200/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200";
  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-amber-300/30 bg-black/35 p-6 shadow-xl backdrop-blur"
      aria-busy={busy}
    >
      <div
        className={`rounded-lg border-2 border-dashed p-5 transition ${dragging ? "border-amber-200 bg-amber-100/10" : "border-amber-200/40"}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy && inputRef.current) inputRef.current.value = "";
          selectFiles(event.dataTransfer.files);
        }}
      >
        <label className="block space-y-3 text-sm font-medium text-amber-100">
          <span className="block text-lg font-semibold">
            Choose or drop your replay
          </span>
          <span
            className="block text-sm font-normal text-amber-50/80"
            id="replay-help"
          >
            Blood Bowl 3 replay (.xml or .bbr), maximum 4 MB. One replay at a
            time.
          </span>
          <input
            ref={inputRef}
            className="block w-full min-w-0 rounded-md border border-amber-200/40 bg-black/30 px-3 py-2 text-sm text-amber-50 disabled:opacity-60"
            type="file"
            name="replay"
            accept=".xml,.bbr,text/xml,application/xml"
            disabled={busy}
            aria-describedby="replay-help replay-selection"
            onChange={(event) => selectFiles(event.currentTarget.files)}
          />
        </label>
        <p
          id="replay-selection"
          className="mt-3 break-words text-sm text-amber-100"
          aria-live="polite"
        >
          {file
            ? `Ready: ${file.name} (${file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`})`
            : "No replay selected."}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || !file}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
        >
          {busy ? "Rolling..." : "Analyze Nuffle Luck"}
        </button>
        {busy ? (
          <button type="button" onClick={cancel} className={buttonClass}>
            Cancel analysis
          </button>
        ) : null}
        {hasReport ? (
          <>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                onReset();
                setFile(null);
                setStatus(null);
                setError(null);
                if (inputRef.current) {
                  inputRef.current.value = "";
                  inputRef.current.focus();
                }
              }}
            >
              Upload Another Replay
            </button>
            <button type="button" className={buttonClass} onClick={onDownload}>
              Download JSON
            </button>
          </>
        ) : null}
      </div>
      <p role="status" className="mt-3 text-sm text-amber-100/90">
        {status}
      </p>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-300/60 bg-red-900/30 px-4 py-3 text-sm text-red-100"
        >
          {error} Your file has not been changed.
        </p>
      ) : null}
    </form>
  );
}
