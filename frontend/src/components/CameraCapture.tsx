import { useCallback, useRef, useState } from "react";
import Webcam from "react-webcam";
import { Camera as CameraIcon, RotateCcw, SwitchCamera } from "lucide-react";

interface CameraCaptureProps { disabled?: boolean; onCapture: (dataUrl: string) => void; }
type FacingMode = "user" | "environment";

export default function CameraCapture({ disabled, onCapture }: CameraCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [error, setError] = useState<string | null>(null);
  const [lastShot, setLastShot] = useState<string | null>(null);

  const handleCapture = useCallback(() => {
    setError(null);
    const wc = webcamRef.current;
    if (!wc) { setError("Webcam not ready yet — try again."); return; }
    const d = wc.getScreenshot();
    if (!d) { setError("Could not grab a frame from the webcam."); return; }
    setLastShot(d);
    onCapture(d);
  }, [onCapture]);

  return (
    <div className="neo-card-static flex min-h-[360px] flex-col gap-4 rounded-3xl p-5">
      <div className="relative overflow-hidden rounded-2xl border-[3px] border-black bg-gray-100" style={{ boxShadow: "3px 3px 0px #000" }}>
        {lastShot ? (
          <img src={lastShot} alt="Last capture" className="aspect-video w-full object-cover" />
        ) : (
          <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ width: 1280, height: 720, facingMode }} className="aspect-video w-full object-cover" mirrored={facingMode === "user"}
            onUserMediaError={(err) => setError(err instanceof DOMException ? err.message : "Could not access the webcam.")} />
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setLastShot(null)} disabled={!lastShot || disabled} className="btn-secondary"><RotateCcw className="h-4 w-4" />Retake</button>
        <button type="button" onClick={() => setFacingMode(c => c === "user" ? "environment" : "user")} disabled={disabled} className="btn-secondary" aria-label="Switch camera"><SwitchCamera className="h-4 w-4" />{facingMode === "user" ? "Front" : "Back"}</button>
        <button type="button" onClick={handleCapture} disabled={disabled} className="btn-primary"><CameraIcon className="h-4 w-4" />Capture</button>
      </div>
      {error && <p className="rounded-xl border-[3px] border-red-400 bg-red-50 px-4 py-2 text-xs font-bold text-red-600" style={{ boxShadow: "3px 3px 0px #000" }}>{error}</p>}
    </div>
  );
}
