"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buttonPrimary, buttonSecondary, fieldClass } from "@/components/ui";
import { CheckInBanner } from "@/components/checkin-result";
import { scanCheckIn } from "./actions";
import type { ScanResult } from "./shared";

type CameraState = "starting" | "scanning" | "denied" | "unavailable";

export function Scanner({
  tenantSlug,
  eventSlug,
}: {
  tenantSlug: string;
  eventSlug: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  // Guards against the camera firing the same code dozens of times a second:
  // ignore a repeat of the last code within a short window, and never overlap
  // requests.
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const inFlight = useRef(false);

  const submit = useCallback(
    async (code: string) => {
      const value = code.trim();
      if (!value || inFlight.current) return;
      const now = Date.now();
      if (lastRef.current && lastRef.current.code === value && now - lastRef.current.at < 3000) {
        return;
      }
      lastRef.current = { code: value, at: now };
      inFlight.current = true;
      setBusy(true);
      try {
        const res = await scanCheckIn({ tenantSlug, eventSlug, code: value });
        setResult(res);
      } catch {
        setResult({ outcome: "invalid" });
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [tenantSlug, eventSlug],
  );

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera("unavailable");
        return;
      }
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        if (cancelled || !videoRef.current) return;
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (res) => {
            if (res) void submit(res.getText());
          },
        );
        if (cancelled) controls?.stop();
        else setCamera("scanning");
      } catch {
        setCamera("denied");
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [submit]);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
      <div>
        <div className="relative overflow-hidden rounded-xl border border-line bg-black">
          {/* The live camera. Squared off so the framing matches a QR. */}
          <video
            ref={videoRef}
            className="aspect-square w-full object-cover"
            muted
            playsInline
          />
          {camera !== "scanning" ? (
            <div className="absolute inset-0 grid place-items-center bg-surface/95 p-6 text-center">
              <p className="text-sm text-muted">
                {camera === "starting"
                  ? "Starting the camera…"
                  : camera === "denied"
                    ? "Camera access was blocked. Allow it in your browser, or type a code below."
                    : "No camera here. Type or paste a code below to check someone in."}
              </p>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-faint">
          Point the camera at an attendee&rsquo;s check-in code. Each one is marked
          present the moment it&rsquo;s read.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {result ? (
          <CheckInBanner
            outcome={result.outcome}
            name={result.name}
            atIso={result.atIso}
            eventTitle={result.eventTitle}
          />
        ) : (
          <div
            className="rounded-xl border border-dashed border-line-strong p-5 text-center text-muted"
            aria-live="polite"
          >
            <p className="py-2 text-sm">Ready to scan.</p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(manual);
            setManual("");
          }}
          className="flex flex-col gap-2"
        >
          <label className="text-xs font-medium text-muted" htmlFor="manual-code">
            Enter a code by hand
          </label>
          <input
            id="manual-code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Paste a ticket code or link"
            className={fieldClass}
          />
          <button type="submit" disabled={busy} className={buttonPrimary}>
            {busy ? "Checking…" : "Check in"}
          </button>
          {result ? (
            <button
              type="button"
              onClick={() => setResult(null)}
              className={buttonSecondary}
            >
              Clear
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
