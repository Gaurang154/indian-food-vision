/** Webcam capture component for live image snapshots. */
import { useCallback, useRef, useState } from "react";
import Webcam from "react-webcam";
import { Camera as CameraIcon, RotateCcw, SwitchCamera } from "lucide-react";

interface CameraCaptureProps {
  disabled?: boolean;
  onCapture: (dataUrl: string) => void;
}

type FacingMode = "user" | "environment";

export default function CameraCapture({ disabled, onCapture }: CameraCaptureProps) {
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
    <div className="glass glow-border flex min-h-[360px] flex-col gap-4 rounded-3xl p-5">
      <div className="relative overflow-hidden rounded-2xl bg-black">
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
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/15" />
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
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
