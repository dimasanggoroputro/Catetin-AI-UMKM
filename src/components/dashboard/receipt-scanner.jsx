import { useState, useRef, useEffect } from "react";
import {
  Camera,
  ImagePlus,
  LoaderCircle,
  AlertCircle,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReceiptPreview from "./receipt-preview";
import { mapAppError } from "@/lib/error-handler";

export default function ReceiptScanner({ onSave, onClose }) {
  const [file, setFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [status, setStatus] = useState("idle"); // idle | compressing | uploading | review | error
  const [errorMsg, setErrorMsg] = useState("");
  const [parsedResults, setParsedResults] = useState(null);
  const [merchantName, setMerchantName] = useState("");
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  // Check quota status on mount
  useEffect(() => {
    const saved = localStorage.getItem("catetin-ai-quota-exceeded");
    if (saved) {
      const timestamp = parseInt(saved);
      if (timestamp) {
        const exceededDate = new Date(timestamp).toDateString();
        const currentDate = new Date().toDateString();
        if (exceededDate === currentDate) {
          setIsQuotaExceeded(true);
        } else {
          localStorage.removeItem("catetin-ai-quota-exceeded");
        }
      }
    }
  }, []);

  const handleFileChange = async (e) => {
    if (isQuotaExceeded) return;
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setImagePreview(URL.createObjectURL(selectedFile));
    setErrorMsg("");
    setStatus("compressing");

    try {
      const compressed = await compressImage(selectedFile);
      uploadAndScan(compressed.base64, compressed.mimeType);
    } catch (err) {
      console.error("[RECEIPT_COMPRESS]", err);
      const { message } = mapAppError(err, "RECEIPT_SCAN");
      setErrorMsg(message);
      setStatus("error");
    }
  };

  const compressImage = (imageFile) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_SIZE = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve({
            base64: dataUrl,
            mimeType: "image/jpeg",
          });
        };
        img.onerror = () =>
          reject(
            new Error(
              "Gagal membaca orientasi gambar struk. Pastikan file valid.",
            ),
          );
        img.src = event.target.result;
      };
      reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
      reader.readAsDataURL(imageFile);
    });
  };

  const uploadAndScan = async (base64Str, mimeType) => {
    setStatus("uploading");
    try {
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Str, mimeType }),
      });

      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 429 || errData.error === "RATE_LIMIT_EXCEEDED") {
          localStorage.setItem(
            "catetin-ai-quota-exceeded",
            Date.now().toString(),
          );
          setIsQuotaExceeded(true);
        }
        throw new Error(errData.message || "Gagal menganalisa struk belanja.");
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(
          "Dokumen tidak dapat diproses atau tidak ada transaksi yang dikenali. Coba foto ulang dengan cahaya lebih terang.",
        );
      }

      setMerchantName(data.merchantName || "");
      setParsedResults(data.items || []);
      setStatus("review");
    } catch (err) {
      console.error("[RECEIPT_SCAN]", err);
      const { message } = mapAppError(err, "RECEIPT_SCAN");
      setErrorMsg(message);
      setStatus("error");
    }
  };

  const handleReset = () => {
    setFile(null);
    setImagePreview("");
    setParsedResults(null);
    setMerchantName("");
    setErrorMsg("");
    setStatus("idle");
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  // If in review state, render the preview component directly inside the sheet
  if (status === "review" && parsedResults) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-xs"
          onClick={onClose}
        />
        <div className="relative w-full sm:max-w-2xl bg-white dark:bg-zinc-950 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up overflow-hidden max-h-[90dvh] sm:max-h-[85vh] flex flex-col">
          <div className="sm:hidden w-10 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 mx-auto my-3" />
          <ReceiptPreview
            items={parsedResults}
            merchantName={merchantName}
            onCancel={handleReset}
            onSave={onSave}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Sheet panel */}
      <div className="relative w-full sm:max-w-md bg-white dark:bg-zinc-950 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up max-h-[90dvh] overflow-y-auto">
        {/* Drag handle for mobile */}
        <div className="w-10 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 mx-auto mb-5 sm:hidden" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Title */}
        <div className="text-center mt-2 mb-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-3 text-emerald-500">
            <Camera className="h-6 w-6" />
          </div>
          <h3 className="text-base font-extrabold text-zinc-900 dark:text-white leading-tight">
            Scan Dokumen Keuangan
          </h3>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium max-w-[280px] mx-auto leading-relaxed">
            Foto struk, nota, invoice, atau catatan transaksi tulisan tangan toko Bos. AI akan membaca item,
            nominal, dan kategori secara otomatis.
          </p>
        </div>

        {/* Quota Exceeded Alert Banner */}
        {isQuotaExceeded && (
          <div className="mb-5 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400 flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-left space-y-1">
              <h4 className="text-xs font-black uppercase tracking-wider">
                Kuota Harian AI Habis
              </h4>
              <p className="text-[11px] font-medium leading-relaxed">
                Buku Kas: Kuota pemindaian struk harian Bos hari ini sudah
                habis. Silakan coba kembali besok atau gunakan input
                manual/suara.
              </p>
            </div>
          </div>
        )}

        {/* Action Panel / Upload Selector */}
        {status === "idle" && (
          <div className="space-y-3">
            <button
              onClick={() =>
                !isQuotaExceeded && cameraInputRef.current?.click()
              }
              disabled={isQuotaExceeded}
              className={cn(
                "w-full py-4 px-4 rounded-2xl text-xs font-extrabold tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-lg",
                isQuotaExceeded
                  ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border border-zinc-200 dark:border-zinc-800/80 cursor-not-allowed shadow-none"
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:from-emerald-400 hover:to-teal-400 active:scale-[0.98] cursor-pointer shadow-emerald-500/10",
              )}
            >
              <Camera className="h-4.5 w-4.5 stroke-[2.5]" />
              Ambil Foto Dokumen
            </button>

            <button
              onClick={() =>
                !isQuotaExceeded && galleryInputRef.current?.click()
              }
              disabled={isQuotaExceeded}
              className={cn(
                "w-full py-4 px-4 rounded-2xl border text-xs font-extrabold tracking-wider uppercase flex items-center justify-center gap-2 transition-all",
                isQuotaExceeded
                  ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border-zinc-200 dark:border-zinc-800/80 cursor-not-allowed"
                  : "border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800 active:scale-[0.98] cursor-pointer",
              )}
            >
              <ImagePlus className="h-4.5 w-4.5" />
              Pilih dari Galeri
            </button>
          </div>
        )}

        {/* Hidden inputs */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={cameraInputRef}
          onChange={handleFileChange}
          className="hidden"
          disabled={isQuotaExceeded}
        />
        <input
          type="file"
          accept="image/*"
          ref={galleryInputRef}
          onChange={handleFileChange}
          className="hidden"
          disabled={isQuotaExceeded}
        />

        {/* Loading Processing State */}
        {(status === "compressing" || status === "uploading") && (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-md animate-ping" />
              <LoaderCircle className="h-10 w-10 text-emerald-500 animate-spin relative" />
            </div>
            <h4 className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5 justify-center">
              <Sparkles className="h-4.5 w-4.5 text-emerald-500 animate-pulse fill-emerald-500/10" />
              AI Sedang Menganalisis
            </h4>
            <p className="mt-2 text-[11px] text-zinc-400 font-medium max-w-[240px] leading-relaxed">
              {status === "compressing"
                ? "Sedang mempersiapkan dan mengompresi gambar..."
                : "Membaca teks dokumen menggunakan Gemini Vision..."}
            </p>
          </div>
        )}

        {/* Error State */}
        {status === "error" && (
          <div className="p-4 rounded-2xl border border-rose-500/10 bg-rose-500/5 text-center space-y-4">
            <div className="flex justify-center text-rose-500">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-black text-rose-600 dark:text-rose-400">
                Pembacaan Dokumen Gagal
              </h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                {errorMsg}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={isQuotaExceeded}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95",
                  isQuotaExceeded
                    ? "bg-zinc-100 dark:bg-zinc-850 text-zinc-400 cursor-not-allowed"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/80 cursor-pointer",
                )}
              >
                Coba Lagi
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 text-xs font-bold transition-all cursor-pointer hover:bg-stone-50 active:scale-95"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
