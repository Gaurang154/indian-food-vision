/** Drag-and-drop / click-to-pick image uploader. */
import { useCallback, useEffect, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Image as ImageIcon, UploadCloud, X } from "lucide-react";

interface ImageUploaderProps {
  disabled?: boolean;
  onSelect: (file: File) => void;
}

const ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export default function ImageUploader({
  disabled,
  onSelect,
}: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>("");
  const [rejectMsg, setRejectMsg] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      setRejectMsg(null);
      if (rejections.length > 0) {
        const first = rejections[0].errors[0]?.message ?? "File rejected";
        setRejectMsg(first);
        return;
      }
      const file = accepted[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setPreview(url);
      setPreviewName(file.name);
      onSelect(file);
    },
    [onSelect]
  );

  // Revoke the blob URL when it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    disabled,
    maxSize: 10 * 1024 * 1024,
  });

  const clearPreview = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setPreview(null);
    setPreviewName("");
  };

  return (
    <div>
      <div
        {...getRootProps()}
        className={`neo-card-static glow-border relative flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-3xl p-6 text-center transition-all duration-300 ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        } ${
          isDragActive
            ? "scale-[1.01] border-neon-purple/30 shadow-brutal-purple"
            : ""
        }`}
      >
        <input {...getInputProps()} />
        {preview ? (
          <div className="relative w-full">
            <img
              src={preview}
              alt={previewName}
              className="max-h-[420px] w-full rounded-2xl border-2 border-white/[0.08] object-contain"
            />
            <button
              onClick={clearPreview}
              className="absolute right-3 top-3 rounded-lg border-2 border-white/20 bg-black/70 p-1.5 text-white/80 backdrop-blur-md transition-all hover:bg-black/90 hover:text-white active:translate-x-[1px] active:translate-y-[1px]"
              style={{ boxShadow: "2px 2px 0px rgba(0,0,0,0.4)" }}
              aria-label="Remove preview"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mt-3 truncate text-xs font-medium text-white/50">
              <ImageIcon className="mr-1 inline h-3 w-3 align-[-2px]" />
              {previewName}
            </p>
          </div>
        ) : (
          <>
            <div
              className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-neon-purple/20 bg-gradient-to-br from-neon-purple/20 via-neon-pink/15 to-neon-cyan/15"
              style={{
                boxShadow: "3px 3px 0px rgba(139, 92, 246, 0.15)",
              }}
            >
              <UploadCloud className="h-7 w-7 text-neon-purple" />
            </div>
            <h3 className="font-display text-xl font-bold text-white">
              {isDragActive ? "Drop it here" : "Drag & drop an image"}
            </h3>
            <p className="mt-2 text-sm text-white/55">
              or click anywhere in this box to browse
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] uppercase tracking-widest text-white/50">
              <span
                className="rounded-full border-[1.5px] border-white/[0.12] bg-white/[0.04] px-3 py-1 font-bold"
                style={{
                  boxShadow: "2px 2px 0px rgba(0,0,0,0.15)",
                }}
              >
                JPG
              </span>
              <span
                className="rounded-full border-[1.5px] border-white/[0.12] bg-white/[0.04] px-3 py-1 font-bold"
                style={{
                  boxShadow: "2px 2px 0px rgba(0,0,0,0.15)",
                }}
              >
                PNG
              </span>
              <span
                className="rounded-full border-[1.5px] border-white/[0.12] bg-white/[0.04] px-3 py-1 font-bold"
                style={{
                  boxShadow: "2px 2px 0px rgba(0,0,0,0.15)",
                }}
              >
                WebP
              </span>
              <span
                className="rounded-full border-[1.5px] border-neon-lime/20 bg-neon-lime/[0.06] px-3 py-1 font-bold text-neon-lime/70"
                style={{
                  boxShadow: "2px 2px 0px rgba(163,230,53,0.1)",
                }}
              >
                ≤ 10 MB
              </span>
            </div>
          </>
        )}
      </div>

      {rejectMsg && (
        <p
          className="mt-3 rounded-xl border-2 border-red-500/30 bg-red-500/[0.08] px-4 py-2 text-xs font-medium text-red-200"
          style={{ boxShadow: "3px 3px 0px rgba(220,38,38,0.12)" }}
        >
          {rejectMsg}
        </p>
      )}
    </div>
  );
}
