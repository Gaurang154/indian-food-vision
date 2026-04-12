import { useCallback, useEffect, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Image as ImageIcon, UploadCloud, X } from "lucide-react";

interface ImageUploaderProps { disabled?: boolean; onSelect: (file: File) => void; }

const ACCEPT = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] };

export default function ImageUploader({ disabled, onSelect }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [rejectMsg, setRejectMsg] = useState<string | null>(null);

  const onDrop = useCallback((accepted: File[], rejections: FileRejection[]) => {
    setRejectMsg(null);
    if (rejections.length > 0) { setRejectMsg(rejections[0].errors[0]?.message ?? "File rejected"); return; }
    const file = accepted[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPreviewName(file.name);
    onSelect(file);
  }, [onSelect]);

  useEffect(() => { return () => { if (preview) URL.revokeObjectURL(preview); }; }, [preview]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPT, multiple: false, disabled, maxSize: 10 * 1024 * 1024 });

  const clearPreview = (e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); setPreview(null); setPreviewName(""); };

  return (
    <div>
      <div
        {...getRootProps()}
        className={`neo-card-static relative flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-3xl p-6 text-center transition-all duration-300 ${disabled ? "cursor-not-allowed opacity-50" : ""} ${isDragActive ? "scale-[1.02] !border-brutal-lime !bg-brutal-lime/10" : ""}`}
        style={{ boxShadow: isDragActive ? "7px 7px 0px #000" : "5px 5px 0px #000" }}
      >
        <input {...getInputProps()} />
        {preview ? (
          <div className="relative w-full">
            <img src={preview} alt={previewName} className="max-h-[420px] w-full rounded-2xl border-[3px] border-black object-contain" style={{ boxShadow: "3px 3px 0px #000" }} />
            <button onClick={clearPreview} className="absolute right-3 top-3 rounded-lg border-[3px] border-black bg-white p-1.5 text-gray-700 transition-all hover:bg-gray-100 active:translate-x-[2px] active:translate-y-[2px] cursor-pointer" style={{ boxShadow: "2px 2px 0px #000" }} aria-label="Remove preview">
              <X className="h-4 w-4" />
            </button>
            <p className="mt-3 truncate text-xs font-bold text-gray-500"><ImageIcon className="mr-1 inline h-3 w-3 align-[-2px]" />{previewName}</p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border-[3px] border-black bg-brutal-pink/30" style={{ boxShadow: "3px 3px 0px #000" }}>
              <UploadCloud className="h-7 w-7 text-gray-800" />
            </div>
            <h3 className="font-display text-xl font-extrabold text-gray-900">{isDragActive ? "Drop it here" : "Drag & drop an image"}</h3>
            <p className="mt-2 text-sm text-gray-500">or click anywhere in this box to browse</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] uppercase tracking-widest">
              {["JPG", "PNG", "WebP"].map((f) => (
                <span key={f} className="rounded-full border-2 border-black bg-white px-3 py-1 font-extrabold text-gray-700" style={{ boxShadow: "2px 2px 0px #000" }}>{f}</span>
              ))}
              <span className="rounded-full border-2 border-black bg-brutal-gold/40 px-3 py-1 font-extrabold text-gray-800" style={{ boxShadow: "2px 2px 0px #000" }}>≤ 10 MB</span>
            </div>
          </>
        )}
      </div>
      {rejectMsg && <p className="mt-3 rounded-xl border-[3px] border-red-400 bg-red-50 px-4 py-2 text-xs font-bold text-red-600" style={{ boxShadow: "3px 3px 0px #000" }}>{rejectMsg}</p>}
    </div>
  );
}
