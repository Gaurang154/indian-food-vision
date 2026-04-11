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

export default function ImageUploader({ disabled, onSelect }: ImageUploaderProps) {
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
        className={`glass glow-border relative flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-3xl p-6 text-center transition-all duration-300 ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        } ${isDragActive ? "scale-[1.01] shadow-glow" : ""}`}
      >
        <input {...getInputProps()} />
        {preview ? (
          <div className="relative w-full">
            <img
              src={preview}
              alt={previewName}
              className="max-h-[420px] w-full rounded-2xl object-contain"
            />
            <button
              onClick={clearPreview}
              className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/60 p-1.5 text-white/80 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white"
              aria-label="Remove preview"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mt-3 truncate text-xs text-white/50">
              <ImageIcon className="mr-1 inline h-3 w-3 align-[-2px]" />
              {previewName}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-purple/30 via-accent-pink/20 to-accent-cyan/20">
              <UploadCloud className="h-7 w-7 text-accent-purple" />
            </div>
            <h3 className="font-display text-xl font-semibold text-white">
              {isDragActive ? "Drop it here" : "Drag & drop an image"}
            </h3>
            <p className="mt-2 text-sm text-white/60">
              or click anywhere in this box to browse
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] uppercase tracking-widest text-white/40">
              <span className="rounded-full border border-white/10 px-2.5 py-1">JPG</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">PNG</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">WebP</span>
              <span className="rounded-full border border-white/10 px-2.5 py-1">≤ 10 MB</span>
            </div>
          </>
        )}
      </div>

      {rejectMsg && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {rejectMsg}
        </p>
      )}
    </div>
  );
}
