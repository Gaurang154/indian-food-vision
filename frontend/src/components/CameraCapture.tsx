/** Webcam capture component for live image snapshots. */
import { useCallback, useRef, useState } from "react";
import Webcam from "react-webcam";
import { Camera as CameraIcon, RotateCcw, SwitchCamera } from "lucide-react";

interface CameraCaptureProps {
  disabled?: boolean;
  onCapture: (dataUrl: string) => void;
}

type FacingMode = "user" | "environment";

export default function CameraCapture({
  disabled,
  onCapture,
}: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [error, setError] = useState<string | null>(null);
  const [lastShot, setLastShot] = useState<string | null>(null);

  const handleCapture = useCallback(() => {
    setError(null);
    const webcam = webcamRef.current;
    if (!webcam) {
      setError("Webcam not ready yet — try again.");
      return;
    }
    const dataUrl = webcam.getScreenshot();
    if (!dataUrl) {
      setError("Could not grab a frame from the webcam.");
      return;
    }
    setLastShot(dataUrl);
    onCapture(dataUrl);
  }, [onCapture]);

  const handleSwitch = () => {
    setFacingMode((current) => (current === "user" ? "environment" : "user"));
  };

  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode,
  };

  return (
    <div className="neo-card-static glow-border flex min-h-[360px] flex-col gap-4 rounded-3xl p-5">
      <div
        className="relative overflow-hidden rounded-2xl border-2 border-white/[0.08] bg-black"
        style={{ boxShadow: "3px 3px 0px rgba(0,0,0,0.3)" }}
      >
        {lastShot ? (
          <img
            src={lastShot}
            alt="Last capture"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            className="aspect-video w-full object-cover"
            mirrored={facingMode === "user"}
            onUserMediaError={(err) => {
              const message =
                err instanceof DOMException
                  ? err.message
                  : "Could not access the webcam. Check permissions.";
              setError(message || "Webcam access denied.");
            }}
          />
        )}

        {!lastShot && !error && (
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-white/[0.06]" />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setLastShot(null)}
          disabled={!lastShot || disabled}
          className="btn-secondary"
        >
          <RotateCcw className="h-4 w-4" />
          Retake
        </button>
        <button
          type="button"
          onClick={handleSwitch}
          disabled={disabled}
          className="btn-secondary"
          aria-label="Switch camera"
        >
          <SwitchCamera className="h-4 w-4" />
          {facingMode === "user" ? "Front" : "Back"}
        </button>
        <button
          type="button"
          onClick={handleCapture}
          disabled={disabled}
          className="btn-primary"
        >
          <CameraIcon className="h-4 w-4" />
          Capture
        </button>
      </div>

      {error && (
        <p
          className="rounded-xl border-2 border-red-500/30 bg-red-500/[0.08] px-4 py-2 text-xs font-medium text-red-200"
          style={{ boxShadow: "3px 3px 0px rgba(220,38,38,0.12)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
