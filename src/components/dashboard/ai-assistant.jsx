"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  X,
  Send,
  Mic,
  RefreshCw,
  Trash2,
  Zap,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import {
  parseTransactionText,
  splitIntoSegments,
} from "@/lib/parse-transaction";
import {
  getCachedResponse,
  setCachedResponse,
  clearAICache,
} from "@/lib/ai-cache";
import { mapAppError } from "@/lib/error-handler";

// ─── Constants ───────────────────────────────────────────────────
const WELCOME_MESSAGE = {
  id: "welcome",
  sender: "ai",
  text: 'Halo Bos!\n\nSaya **Catetin AI**, asisten keuangan pribadi tokomu. Bos bisa catat penjualan atau pengeluaran toko langsung di sini.\n\nContoh:\n• *"jual kopi susu 5 porsi 75 ribu"*\n• *"beli gas LPG 22rb"*\n• *"bayar tagihan listrik 150 ribu"*',
};

const SUGGESTIONS = [
  "Jual nasi goreng 3 porsi 60rb",
  "Beli gas LPG 22rb",
  "Bayar listrik toko 150rb",
];

// ─── Helper: buat pesan AI ───────────────────────────────────────
function buildTimestamp() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildAiMessage(text, parsedData = null) {
  return {
    id: Date.now().toString(),
    sender: "ai",
    text,
    timestamp: buildTimestamp(),
    parsedData,
  };
}

function buildSuccessText(txList) {
  function qtyLabel(tx) {
    if (tx.unit) return `${tx.qty}${tx.unit}`; // e.g. "1kg", "500ml"
    return `${tx.qty} pcs`;
  }

  if (txList.length === 1) {
    const { tx } = txList[0];
    const isIncome = tx.type === "income";
    return isIncome
      ? `**Pemasukan Berhasil Dicatat!**\n\nPenjualan **${tx.item}** sebanyak **${qtyLabel(tx)}** senilai **${formatRupiah(tx.amount)}** sudah masuk ke dashboard.`
      : `**Pengeluaran Berhasil Dicatat!**\n\nBelanja **${tx.item}** ${tx.unit || tx.qty > 1 ? `sebanyak **${qtyLabel(tx)}** ` : ""}senilai **${formatRupiah(tx.amount)}** sudah dicatat.`;
  }

  let text = `**${txList.length} transaksi berhasil dicatat!**\n\n`;
  txList.forEach(({ tx }) => {
    const label = tx.type === "income" ? "Penjualan" : "Pembelian";
    text += `• **${label} ${tx.item}** ${tx.unit || tx.qty > 1 ? `(${qtyLabel(tx)}) ` : ""}— *${formatRupiah(tx.amount)}*\n`;
  });
  return text;
}

function buildFailText(failures) {
  let text = `**Transaksi tidak dapat diproses:**\n\n`;
  failures.forEach((f) => {
    text += `• **"${f.rawText}"**\n  *Alasan: ${f.reason}*\n`;
  });
  text += `\nCoba tuliskan seperti: *"jual kopi 2 gelas 40rb"*`;
  return text;
}

// ─── Sub-component: Message Bubble ───────────────────────────────
function MessageBubble({ msg }) {
  const isAi = msg.sender === "ai";

  const renderText = (text) =>
    text.split("\n").map((line, i) => (
      <p
        key={i}
        className={cn(
          "text-xs leading-relaxed font-medium",
          i > 0 && "mt-1.5",
          isAi
            ? "text-zinc-800 dark:text-zinc-200"
            : "text-zinc-900 dark:text-white",
        )}
      >
        {line.split(/(\*\*.*?\*\*|\*.*?\*)/g).map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**"))
            return (
              <strong
                key={j}
                className="font-extrabold text-zinc-950 dark:text-white"
              >
                {part.slice(2, -2)}
              </strong>
            );
          if (part.startsWith("*") && part.endsWith("*"))
            return (
              <em
                key={j}
                className="italic text-emerald-600 dark:text-emerald-400 font-semibold"
              >
                {part.slice(1, -1)}
              </em>
            );
          return part;
        })}
      </p>
    ));

  return (
    <div
      className={cn(
        "flex flex-col max-w-[85%] rounded-2xl p-3 shadow-3xs",
        isAi
          ? "self-start bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-900/80 rounded-tl-sm"
          : "self-end bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/10 rounded-tr-sm",
      )}
    >
      {renderText(msg.text)}

      {msg.parsedData && (
        <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "text-[9px] font-extrabold px-1.5 py-0.5 rounded-sm uppercase tracking-wide",
              msg.parsedData.type === "income"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
            )}
          >
            {msg.parsedData.type === "income" ? "Pemasukan" : "Pengeluaran"}
          </span>
          <span className="text-[9px] font-bold text-zinc-400 uppercase">
            {msg.parsedData.category}
          </span>
          {msg.parsedData.qty > 1 && (
            <span className="text-[9px] font-bold px-1 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
              Qty: {msg.parsedData.qty}
            </span>
          )}
        </div>
      )}

      <span className="text-[8px] font-bold text-zinc-400/80 self-end mt-1 uppercase tracking-widest">
        {msg.timestamp}
      </span>
    </div>
  );
}

// ─── Sub-component: Voice Overlay ────────────────────────────────
function VoiceOverlay({ state, seconds, errorMessage, onStop, onRetry }) {
  const states = {
    listening: {
      color: "bg-emerald-500",
      icon: <Mic className="h-6 w-6 animate-pulse" />,
      title: "Mendengarkan Suara Bos...",
      sub: `Durasi: ${seconds} detik`,
    },
    processing: {
      color: "bg-indigo-500",
      icon: <RefreshCw className="h-6 w-6 animate-spin" />,
      title: "Memproses Suara...",
      sub: "Mengubah ucapan menjadi teks...",
    },
    success: {
      color: "bg-emerald-500",
      icon: <Sparkles className="h-6 w-6 animate-pulse" />,
      title: "Berhasil Diterjemahkan!",
      sub: "Mencatat ke dashboard...",
    },
    failed: {
      color: "bg-rose-500",
      icon: <X className="h-6 w-6" />,
      title: "Gagal Mengenali Suara",
      sub: errorMessage || "Tidak ada suara yang terdeteksi",
    },
  };

  const s = states[state];
  if (!s) return null;

  return (
    <div className="absolute inset-0 bg-zinc-950/95 z-35 flex flex-col items-center justify-center text-center p-6 text-white">
      <div className="relative flex items-center justify-center h-28 w-28 mb-4">
        {state === "listening" && (
          <>
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ripple" />
            <div className="absolute inset-4 rounded-full bg-emerald-500/30 animate-ripple [animation-delay:0.5s]" />
          </>
        )}
        <div
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-full text-white",
            s.color,
          )}
        >
          {s.icon}
        </div>
      </div>
      <h3 className="text-sm font-bold">{s.title}</h3>
      <p className="mt-1 text-xs text-zinc-400 font-semibold">{s.sub}</p>

      {state === "failed" ? (
        <div className="mt-6 flex gap-3">
          <button
            onClick={onRetry}
            className="px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold cursor-pointer"
          >
            Coba Lagi
          </button>
          <button
            onClick={onStop}
            className="px-4 py-1.5 rounded-full border border-zinc-700 bg-zinc-900/50 text-xs font-semibold text-zinc-300 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      ) : state === "listening" ? (
        <button
          onClick={onStop}
          className="mt-6 px-4 py-1.5 rounded-full border border-zinc-700 bg-zinc-900/50 text-xs font-semibold text-zinc-300 cursor-pointer"
        >
          Selesai
        </button>
      ) : null}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────
export default function AIAssistant({
  onAddTransaction,
  onClearTransactions,
  inline = false,
  clearSignal = 0,
  resetSignal = 0,
  transactions = [],
  messages: externalMessages,
  setMessages: externalSetMessages,
  onScanClick,
  keyboardOpen, // Add this here
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  // Toggle: true = pakai Gemini AI, false = parser lokal (manual)
  const [useAI, setUseAI] = useState(true);

  const [localMessages, setLocalMessages] = useState([
    { ...WELCOME_MESSAGE, timestamp: buildTimestamp() },
  ]);

  const messages = externalMessages || localMessages;
  const setMessages = externalSetMessages || setLocalMessages;
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceError, setVoiceError] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null); // Add textareaRef

  // Adjust textarea height dynamically based on content
  useEffect(() => {
    const tx = textareaRef.current;
    if (tx) {
      tx.style.height = "auto";
      if (input.trim() === "") {
        // Reset to minimum height (controlled by CSS)
        return;
      }
      const newHeight = Math.min(tx.scrollHeight, 120);
      tx.style.height = `${newHeight}px`;
    }
  }, [input]);

  // Auto-scroll on keyboard open/close
  useEffect(() => {
    if (keyboardOpen) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 250); // Delay to let visualViewport animation finish
      return () => clearTimeout(timer);
    }
  }, [keyboardOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (voiceState !== "listening") {
      setRecordingSeconds(0);
      return;
    }
    const id = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [voiceState]);

  useEffect(() => {
    if (clearSignal === 0) return;
    setMessages([
      {
        ...WELCOME_MESSAGE,
        id: Date.now().toString(),
        timestamp: buildTimestamp(),
      },
    ]);
  }, [clearSignal]);

  useEffect(() => {
    if (resetSignal === 0) return;
    setMessages((prev) => [
      ...prev,
      buildAiMessage(
        "**Dashboard berhasil direset!** Mari mulai pencatatan keuangan baru!",
      ),
    ]);
  }, [resetSignal]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch (_) {}
    };
  }, []);

  // ─── Voice ───────────────────────────────────────────────────
  const startVoice = () => {
    const API = window?.SpeechRecognition ?? window?.webkitSpeechRecognition;
    if (!API) {
      setVoiceState("failed");
      setVoiceError("Browser tidak mendukung voice input");
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch (_) {}

    const rec = new API();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "id-ID";

    rec.onstart = () => setVoiceState("listening");
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      if (!transcript?.trim()) {
        setVoiceState("failed");
        setVoiceError("Tidak ada suara yang terdeteksi");
        return;
      }
      setVoiceState("processing");
      setTimeout(() => {
        setVoiceState("success");
        setTimeout(() => {
          handleSend(transcript);
          setVoiceState("idle");
        }, 800);
      }, 1000);
    };
    rec.onerror = (e) => {
      setVoiceState("failed");
      const errors = {
        "no-speech": "Tidak ada suara yang terdeteksi",
        "not-allowed": "Izin mikrofon ditolak",
      };
      setVoiceError(errors[e.error] ?? "Terjadi kesalahan pengenalan suara");
    };
    rec.onend = () =>
      setVoiceState((prev) => {
        if (prev === "listening") {
          setVoiceError("Tidak ada suara yang terdeteksi");
          return "failed";
        }
        return prev;
      });

    recognitionRef.current = rec;
    rec.start();
  };

  const stopVoice = () => {
    try {
      recognitionRef.current?.stop();
    } catch (_) {}
    setVoiceState("idle");
  };

  // ─── Local Parser (dipakai saat manual mode ATAU AI rate-limit) ──
  // warningText: string = tampilkan peringatan AI, null = mode manual (tanpa peringatan)
  const runFallbackParser = (trimmedText, warningText) => {
    const segments = splitIntoSegments(trimmedText);
    const prefix = warningText
      ? `Peringatan: ${warningText}\n\nAsisten berjalan dalam mode offline lokal.\n\n`
      : "";

    if (segments.length === 0) {
      setMessages((prev) => [
        ...prev,
        buildAiMessage(
          prefix +
            `Maaf Bos, saya belum memahami maksud pencatatan tersebut.\n\nContoh:\n• *"jual kopi 2 gelas 40rb"*\n• *"beli gas LPG 22rb"*`,
        ),
      ]);
      return;
    }

    const successes = [];
    const failures = [];

    segments.forEach((seg, i) => {
      const result = parseTransactionText(seg);
      if (result.success) {
        const tx = {
          id: `${Date.now()}-${i}`,
          ...result.data,
          time: buildTimestamp(),
        };
        successes.push({ tx, parsedData: result.data });
      } else {
        failures.push({ rawText: seg, reason: result.message });
      }
    });

    if (successes.length === 0) {
      setMessages((prev) => [
        ...prev,
        buildAiMessage(prefix + buildFailText(failures)),
      ]);
      return;
    }

    successes.forEach(({ tx }) => onAddTransaction(tx));

    let responseText = prefix + buildSuccessText(successes);
    if (failures.length > 0) responseText += `\n\n` + buildFailText(failures);

    setMessages((prev) => [
      ...prev,
      buildAiMessage(responseText, successes[0].parsedData),
    ]);
  };

  // ─── Send Message ─────────────────────────────────────────────
  const handleSend = (text = input) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const newMsg = {
      id: Date.now().toString(),
      sender: "user",
      text: trimmed,
      timestamp: buildTimestamp(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInput("");

    // ── Mode Manual: langsung pakai parser lokal, tanpa API call ──
    if (!useAI) {
      runFallbackParser(trimmed, null);
      return;
    }

    // ── Mode AI: cek cache dulu sebelum panggil Gemini API ─────────
    const cached = getCachedResponse(trimmed);
    if (cached) {
      // Cache hit — tidak pakai quota sama sekali
      const { response, transactions: cachedTxList = [] } = cached;
      setMessages((prev) => [
        ...prev,
        buildAiMessage(
          response,
          cachedTxList.length > 0 ? cachedTxList[0] : null,
        ),
      ]);
      return;
    }

    // ── Cache miss — kirim ke Gemini API ──────────────────────────
    setIsTyping(true);

    // Kirim maksimal 6 pesan terakhir sebagai history agar token hemat
    const chatHistoryForApi = messages
      .filter((m) => m.id !== "welcome")
      .slice(-6);

    (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: chatHistoryForApi,
            transactions: transactions,
          }),
        });

        const data = await res.json();
        setIsTyping(false);

        if (!res.ok) {
          if (data.error === "GEMINI_API_KEY_MISSING") {
            runFallbackParser(trimmed, data.message);
            return;
          }

          // ── Rate limit: tampilkan pesan ramah + auto-switch manual ──
          if (data.error === "RATE_LIMIT_EXCEEDED") {
            const retryAfter = data.retryAfter || 60;
            setUseAI(false);
            setMessages((prev) => [
              ...prev,
              buildAiMessage(
                `⏳ **AI sedang istirahat sebentar.**\n\nKuota harian Gemini AI sudah habis. Silakan coba lagi sekitar **${retryAfter} detik** lagi.\n\nTenang Bos! Saya sudah otomatis ganti ke **Mode Manual** ⚡ supaya Bos tetap bisa catat transaksi seperti biasa.`,
              ),
            ]);
            return;
          }

          throw new Error(data.message || "Gagal menghubungkan ke asisten AI");
        }

        const { response, transactions: newTxList = [] } = data;

        // Simpan ke cache (hanya Q&A, bukan pencatatan transaksi)
        setCachedResponse(trimmed, { response, transactions: newTxList });

        if (newTxList.length > 0) {
          newTxList.forEach((tx, i) => {
            const preparedTx = {
              id: `${Date.now()}-${i}`,
              ...tx,
              time: buildTimestamp(),
            };
            onAddTransaction(preparedTx);
          });
        }

        setMessages((prev) => [
          ...prev,
          buildAiMessage(response, newTxList.length > 0 ? newTxList[0] : null),
        ]);
      } catch (err) {
        console.error("[AI_CHAT]", err);
        setIsTyping(false);
        const { message } = mapAppError(err, "AI_CHAT");
        setMessages((prev) => [
          ...prev,
          buildAiMessage(`${message} Coba ulang sebentar lagi.`),
        ]);
      }
    })();
  };

  // ─── Actions ─────────────────────────────────────────────────
  const handleClearHistory = () => {
    if (!confirm("Hapus seluruh percakapan asisten?")) return;
    setMessages([
      {
        ...WELCOME_MESSAGE,
        id: Date.now().toString(),
        timestamp: buildTimestamp(),
      },
    ]);
  };

  const handleResetData = () => {
    if (!confirm("Reset seluruh data transaksi dashboard juga?")) return;
    onClearTransactions();
    clearAICache(); // bersihkan cache saat reset agar data baru tidak tercampur
    setMessages((prev) => [
      ...prev,
      buildAiMessage(
        "**Dashboard berhasil direset!** Mari mulai pencatatan keuangan baru!",
      ),
    ]);
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <>
      {!inline && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="relative">
            {!isOpen && (
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 opacity-70 blur-md animate-pulse-glow" />
            )}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg bg-gradient-to-tr from-emerald-500 via-teal-600 to-indigo-600 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Sparkles className="h-6 w-6 animate-float" />
              )}
            </button>
          </div>
        </div>
      )}

      <div
        className={cn(
          inline
            ? "flex-1 flex flex-col w-full h-full relative overflow-hidden bg-transparent"
            : "fixed inset-x-4 bottom-24 z-50 max-w-lg mx-auto overflow-hidden rounded-2xl border border-zinc-150 dark:border-zinc-900 bg-white dark:bg-zinc-950 shadow-2xl transition-all duration-500 origin-bottom-right",
          !inline &&
            (isOpen
              ? "opacity-100 scale-100 translate-y-0"
              : "opacity-0 scale-90 translate-y-10 pointer-events-none"),
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-900/80 px-4 py-3.5 bg-zinc-50/50 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Sparkles className="h-4 w-4 text-emerald-500 animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                Catetin AI Asisten
              </h4>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold flex items-center gap-1">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full animate-pulse",
                    useAI ? "bg-emerald-500" : "bg-amber-400",
                  )}
                />
                {useAI ? "Mode AI Aktif" : "Mode Manual"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleResetData}
              title="Reset data"
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={handleClearHistory}
              title="Hapus riwayat"
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {!inline && (
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Voice Overlay */}
        {voiceState !== "idle" && (
          <VoiceOverlay
            state={voiceState}
            seconds={recordingSeconds}
            errorMessage={voiceError}
            onStop={stopVoice}
            onRetry={startVoice}
          />
        )}

        {/* Messages */}
        <div
          className={cn(
            "flex flex-col overflow-y-auto px-4 py-3.5 space-y-3.5 bg-[#FAF9F6]/25 dark:bg-[#0C0C0B]/25 scrollbar-none overscroll-contain",
            inline ? "flex-1" : "h-[280px]",
          )}
        >
          <div className="w-full lg:max-w-2xl lg:mx-auto flex flex-col space-y-3.5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {isTyping && (
              <div className="self-start bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-900/80 rounded-2xl rounded-tl-sm p-3.5 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex gap-2 overflow-x-auto px-4 py-2 border-t border-stone-200/50 dark:border-zinc-900/60 bg-white/60 dark:bg-[#0C0C0B]/60 scrollbar-none shrink-0 justify-start lg:justify-center">
          <div className="flex gap-2 overflow-x-auto scrollbar-none w-full lg:max-w-2xl lg:mx-auto">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="whitespace-nowrap shrink-0 text-[10px] font-extrabold px-3 py-1.5 rounded-full border border-stone-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/10 text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/30 transition-all duration-300 cursor-pointer active:scale-95 shadow-3xs"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Input Container */}
        <div
          className={cn(
            "p-3.5 border-t border-stone-200/50 dark:border-zinc-900/60 bg-[#FAF9F6]/40 dark:bg-[#0C0C0B]/40 flex flex-col shrink-0 input-bar-transition w-full",
            "lg:border-t-0 lg:bg-transparent lg:max-w-2xl lg:mx-auto lg:p-0 lg:pb-4",
            keyboardOpen ? "pb-3.5" : "safe-area-bottom pb-4",
          )}
        >
          <div
            className={cn(
              "flex items-end gap-2 w-full",
              "lg:border lg:border-stone-200/80 lg:dark:border-zinc-800/80 lg:bg-white/80 lg:dark:bg-[#0E0E0E]/80 lg:backdrop-blur-md lg:rounded-2xl lg:p-2.5 lg:shadow-md",
            )}
          >
            {/* Mic */}
            <button
              onClick={startVoice}
              className="flex h-10 w-10 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-500 shadow-3xs transition-all cursor-pointer active:scale-90 mb-0.5"
              title="Input suara"
            >
              <Mic className="h-5 w-5 lg:h-4 lg:w-4" />
            </button>

            {/* Camera Scan Receipt */}
            {onScanClick && (
              <button
                onClick={onScanClick}
                className="flex h-10 w-10 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-500 shadow-3xs transition-all cursor-pointer active:scale-90 mb-0.5"
                title="Scan Dokumen"
              >
                <Camera className="h-5 w-5 lg:h-4 lg:w-4" />
              </button>
            )}

            {/* Toggle AI / Manual */}
            <button
              onClick={() => setUseAI((v) => !v)}
              title={
                useAI
                  ? "Mode AI — klik untuk ganti ke Manual"
                  : "Mode Manual — klik untuk ganti ke AI"
              }
              className={cn(
                "flex shrink-0 items-center justify-center gap-1 px-2.5 h-10 lg:h-8 rounded-full border text-[10px] font-extrabold tracking-wide transition-all duration-300 cursor-pointer active:scale-95 mb-0.5",
                useAI
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15"
                  : "bg-amber-400/10 border-amber-400/30 text-amber-600 dark:text-amber-400 hover:bg-amber-400/15",
              )}
            >
              {useAI ? (
                <Sparkles className="h-3 w-3" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              <span className="hidden xs:inline">
                {useAI ? "AI" : "Manual"}
              </span>
            </button>

            {/* Textarea + send button wrapper */}
            <div className="relative flex-1 flex items-end">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                onFocus={() => {
                  // Delay to let the virtual keyboard fully expand, then scroll to bottom
                  setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }, 300);
                }}
                placeholder={
                  useAI
                    ? "Tanya atau catat transaksi..."
                    : "Tulis transaksi Bos..."
                }
                className="w-full resize-none rounded-2xl border border-stone-200 dark:border-zinc-800 pl-4 pr-11 py-3 md:py-2 text-[12px] md:text-xs font-semibold shadow-3xs bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/50 transition-colors max-h-[120px] min-h-[38px] lg:min-h-[34px] lg:py-1.5 lg:pl-3.5 lg:pr-10 leading-relaxed overflow-y-auto"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className={cn(
                  "absolute right-1 bottom-1 flex h-8 w-8 lg:h-7 lg:w-7 items-center justify-center rounded-full text-white transition-all cursor-pointer",
                  input.trim()
                    ? "bg-emerald-500 hover:bg-emerald-600 active:scale-95"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 pointer-events-none scale-90",
                )}
              >
                <Send className="h-3.5 w-3.5 lg:h-3 lg:w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
