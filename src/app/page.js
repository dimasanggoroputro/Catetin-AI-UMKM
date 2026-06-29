"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Navbar from "@/components/dashboard/navbar";
import StatsCard from "@/components/dashboard/stats-card";
import RecentTransactions from "@/components/dashboard/recent-transactions";
import AIAssistant from "@/components/dashboard/ai-assistant";
import SparklineChart from "@/components/dashboard/sparkline-chart";
import CategoryDonutChart from "@/components/dashboard/financial-charts";
import EditTransactionModal from "@/components/dashboard/edit-transaction-modal";
import StoreSetupModal from "@/components/dashboard/store-setup-modal";
import ExportPanel from "@/components/dashboard/export-panel";
import ReceiptScanner from "@/components/dashboard/receipt-scanner";
import {
  Sparkles,
  BarChart3,
  TrendingUp,
  BrainCircuit,
  RefreshCw,
  Trash2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import { Toaster, toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getGuestId } from "@/lib/guest-id";
import LoginModal from "@/components/dashboard/login-modal";
import LandingPage from "@/components/dashboard/landing-page";
import {
  migrateGuestTransactions,
  fetchOrCreateProfile,
  updateProfileStoreName,
} from "@/lib/auth-handler";
import { signOut } from "@/lib/auth";
import { getDemoTransactions } from "@/lib/demo-data";
import { mapAppError, isOnline } from "@/lib/error-handler";

// ─── Supabase field mapping ────────────────────────────────────────
// DB  : id, type, item_name, category, amount, qty, unit, created_at
// App : id, type, item,      category, amount, qty, unit, time
function dbToApp(row) {
  return {
    id: row.id,
    type: row.type,
    item: row.item_name,
    category: row.category ?? "other",
    amount: row.amount,
    qty: row.qty ?? 1,
    unit: row.unit ?? null,
    createdAt: row.created_at, // Preserve for analysis/filtering
    time: new Date(row.created_at).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function appToDb(tx) {
  return {
    type: tx.type,
    item_name: tx.item,
    category: tx.category ?? "other",
    amount: tx.amount,
    qty: tx.qty ?? 1,
    unit: tx.unit ?? null,
  };
}

const OAUTH_HASH_KEYS = [
  "access_token",
  "refresh_token",
  "expires_in",
  "token_type",
  "provider_token",
  "provider_refresh_token",
  "error",
  "error_description",
  "state",
  "session_state",
];

function isOAuthFragment(hash) {
  if (!hash) return false;
  const normalized = hash.replace(/^#/, "");
  const params = normalized.split("&").filter(Boolean);
  if (params.length === 0) return false;
  return params.every((pair) => {
    const [key] = pair.split("=");
    return OAUTH_HASH_KEYS.includes(key);
  });
}

function cleanOAuthHashFragment() {
  if (typeof window === "undefined") return;
  const { hash, pathname, search } = window.location;
  if (!hash) return;
  const normalized = hash.replace(/^#/, "");
  if (normalized === "" || isOAuthFragment(hash)) {
    const newUrl = pathname + search;
    window.history.replaceState({}, document.title, newUrl);
  }
}

// ─── Desktop Sidebar ──────────────────────────────────────────────
function DesktopSidebar({ activeTab, onTabChange, onReset, onClearChat }) {
  const navItems = [
    { id: "kas", label: "Buku Kas", Icon: BarChart3 },
    { id: "chat", label: "Asisten AI", Icon: Sparkles },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-stone-200/50 dark:border-zinc-800/60 bg-[#FAF9F6] dark:bg-[#0C0C0B] py-4 px-3 gap-1">
      <p className="text-[10px] font-extrabold tracking-widest uppercase text-zinc-400 dark:text-zinc-600 px-2 mb-2">
        Menu
      </p>

      {navItems.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer w-full text-left",
            activeTab === id
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
              : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 border border-transparent",
          )}
        >
          <Icon
            className={cn("h-4 w-4", activeTab === id && "text-emerald-500")}
          />
          {label}
        </button>
      ))}

      <div className="mt-auto flex flex-col gap-1 pt-4 border-t border-stone-200/50 dark:border-zinc-800/60">
        <p className="text-[10px] font-extrabold tracking-widest uppercase text-zinc-400 dark:text-zinc-600 px-2 mb-1">
          Aksi
        </p>
        <button
          onClick={onReset}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 border border-transparent transition-all duration-200 cursor-pointer w-full text-left"
        >
          <RefreshCw className="h-4 w-4" />
          Reset Data
        </button>
        <button
          onClick={onClearChat}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 border border-transparent transition-all duration-200 cursor-pointer w-full text-left"
        >
          <Trash2 className="h-4 w-4" />
          Hapus Chat
        </button>
      </div>
    </aside>
  );
}

// ─── Kas Panel (reusable di desktop kanan + mobile tab) ───────────
function KasPanel({
  transactions,
  allTransactions,
  loading = false,
  totalIncome,
  totalExpense,
  totalProfit,
  onDeleteTransaction,
  onEditTransaction,
  activePeriod,
  onPeriodChange,
  onExport,
  newestId,
}) {
  const aiInsights = buildInsights(
    totalIncome,
    totalExpense,
    totalProfit,
    transactions,
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 space-y-5">
      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-3 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-900"
              />
            ))}
          </div>
          <div className="h-3 w-32 rounded-full bg-zinc-200 dark:bg-zinc-800 mt-4" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900"
            />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* Period Filter & Export mobile */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1 p-1 rounded-xl bg-zinc-100/80 dark:bg-zinc-900/60 border border-stone-200/40 dark:border-zinc-800/40 w-fit shrink-0">
              {[
                { id: "today", label: "Hari Ini" },
                { id: "week", label: "Minggu" },
                { id: "month", label: "Bulan" },
                { id: "all", label: "Semua" },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => onPeriodChange(id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer active:scale-95",
                    activePeriod === id
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-3xs"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {onExport && (
              <button
                onClick={onExport}
                className="flex md:hidden h-8 px-3 items-center justify-center gap-1.5 rounded-xl border border-stone-200 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-xs font-bold shadow-3xs cursor-pointer active:scale-95 transition-all"
              >
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                Laporan
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold tracking-wider uppercase text-zinc-400 dark:text-zinc-500">
                Arus Kas Toko
              </h3>
              <div className="flex items-center gap-1 text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </div>
            </div>
            <div className="flex overflow-x-auto lg:overflow-x-visible snap-x snap-mandatory lg:snap-none gap-3.5 pb-3 -mx-4 lg:mx-0 px-4 lg:px-0 scrollbar-none lg:grid lg:grid-cols-3">
              <StatsCard
                title="Pemasukan Toko"
                value={totalIncome}
                description="Uang masuk dari penjualan."
                type="income"
              />
              <StatsCard
                title="Pengeluaran"
                value={totalExpense}
                description="Uang keluar operasional."
                type="expense"
              />
              <StatsCard
                title="Untung Bersih"
                value={totalProfit}
                description="Sisa keuntungan bersih."
                type="profit"
              />
            </div>
          </div>

          {/* Sparkline Chart */}
          <SparklineChart transactions={allTransactions} />

          {/* Category Donut Chart */}
          <CategoryDonutChart transactions={transactions} />

          {/* AI Insights */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold tracking-wider uppercase text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
              <BrainCircuit className="h-3.5 w-3.5 text-indigo-500" />
              Analisis Keuangan AI
            </h3>
            {aiInsights.length === 0 ? (
              <div className="py-10 px-5 rounded-2xl border border-dashed border-stone-200 dark:border-zinc-800/60 bg-gradient-to-b from-white/60 to-stone-50/30 dark:from-zinc-900/20 dark:to-zinc-950/10 flex flex-col items-center justify-center text-center">
                <div className="relative mb-4">
                  <div
                    className="absolute -inset-2 rounded-full bg-indigo-500/8 dark:bg-indigo-500/5 blur-lg animate-pulse"
                    style={{ animationDuration: "5s" }}
                  />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
                    <BrainCircuit className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
                  </div>
                </div>
                <h4 className="text-sm font-black text-zinc-800 dark:text-white tracking-tight">
                  Analisis Belum Tersedia
                </h4>
                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 font-medium max-w-[260px] leading-relaxed">
                  Catat beberapa transaksi agar AI dapat menganalisis kinerja
                  bisnis Bos secara otomatis.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-150 dark:border-zinc-900/60 bg-white dark:bg-zinc-900/40 p-4 space-y-3">
                {aiInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className="flex items-start align-top gap-2.5"
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-stone-50 dark:bg-zinc-900 border border-stone-150 dark:border-zinc-800 shrink-0 mt-0.5">
                      {insight.icon}
                    </div>
                    <p
                      className="text-[13px] text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: insight.text.replace(
                          /\*\*(.*?)\*\*/g,
                          '<strong class="font-bold text-zinc-900 dark:text-white">$1</strong>',
                        ),
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <RecentTransactions
            transactions={transactions}
            onDeleteTransaction={onDeleteTransaction}
            onEditTransaction={onEditTransaction}
            newestId={newestId}
          />
        </>
      )}
    </div>
  );
}

// ─── Pure function: AI insights ───────────────────────────────────
function buildInsights(totalIncome, totalExpense, totalProfit, transactions) {
  if (transactions.length === 0) return [];

  const insights = [];

  // 1. Calculate top category by income
  const categoryIncomes = {};
  transactions
    .filter((tx) => tx.type === "income")
    .forEach((tx) => {
      categoryIncomes[tx.category] =
        (categoryIncomes[tx.category] || 0) + tx.amount;
    });

  let topCategory = null;
  let maxIncome = 0;
  Object.entries(categoryIncomes).forEach(([cat, val]) => {
    if (val > maxIncome) {
      maxIncome = val;
      topCategory = cat;
    }
  });

  const categoryLabels = {
    food: "Kuliner",
    shopping: "Belanja",
    bills: "Tagihan",
    salary: "Operasional",
    rent: "Tempat",
    other: "Lainnya",
  };

  if (topCategory && maxIncome > 0) {
    const label = categoryLabels[topCategory] || topCategory;
    insights.push({
      id: "ins-top-cat",
      text: `Pilar penjualan utama toko Bos berasal dari kategori **${label}** sebesar **${formatRupiah(maxIncome)}**.`,
      icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
    });
  }

  // 2. Average transaction size
  const incomes = transactions.filter((tx) => tx.type === "income");
  if (incomes.length > 0) {
    const avgIncome = Math.round(
      incomes.reduce((s, tx) => s + tx.amount, 0) / incomes.length,
    );
    insights.push({
      id: "ins-avg-tx",
      text: `Rata-rata pemasukan per transaksi toko Bos adalah **${formatRupiah(avgIncome)}** dari total **${incomes.length}** penjualan.`,
      icon: <BarChart3 className="h-4 w-4 text-blue-500" />,
    });
  }

  // 3. Margin & Health check
  if (totalIncome > 0) {
    const margin = Math.round((totalProfit / totalIncome) * 100);
    let status = "Sangat Sehat";
    if (margin < 10) {
      status = "Perlu Waspada (Margin tipis)";
    } else if (margin < 25) {
      status = "Cukup Stabil";
    }
    insights.push({
      id: "ins-health",
      text: `Margin bersih toko berada di angka **${margin}%** (${status}). Selalu pantau operasional Bos!`,
      icon: <BrainCircuit className="h-4 w-4 text-violet-500" />,
    });
  }

  return insights;
}

// ─── Page ─────────────────────────────────────────────────────────
export default function Home() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("dark");
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("kas");

  const [storeName, setStoreName] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [showEditSetup, setShowEditSetup] = useState(false);
  const [activePeriod, setActivePeriod] = useState("all");
  const [editingTx, setEditingTx] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [newestId, setNewestId] = useState(null);

  // Trigger clear/reset chat dari sidebar desktop
  const [clearChatSignal, setClearChatSignal] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);

  // Shared chat messages state so history is preserved between mobile/desktop viewport resizing
  const [chatMessages, setChatMessages] = useState(() => [
    {
      id: "welcome",
      sender: "ai",
      text: 'Halo Bos!\n\nSaya **Catetin AI**, asisten keuangan pribadi tokomu. Bos bisa catat penjualan atau pengeluaran toko langsung di sini.\n\nContoh:\n• *"jual kopi susu 5 porsi 75 ribu"*\n• *"beli gas LPG 22rb"*\n• *"bayar tagihan listrik 150 ribu"*',
      timestamp: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);

  const [user, setUser] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const keyboardTimerRef = useRef(null);
  const bottomNavTimerRef = useRef(null);

  const [authLoading, setAuthLoading] = useState(true);
  const lastProcessedUserIdRef = useRef(null);
  const profileChannelRef = useRef(null);

  const requestGuestOnboarding = () => {
    setShowLanding(false);
    const savedStore = localStorage.getItem("catetin-store-name");
    if (!savedStore) {
      setShowSetup(true);
    } else {
      setStoreName(savedStore);
    }
    if (!localStorage.getItem("catetin-guest-id")) {
      getGuestId();
    }
  };

  // Safe URL hash cleaner to remove trailing # and OAuth fragments while keeping other query parameters
  const cleanAuthHash = () => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    const hash = window.location.hash;
    
    if (
      hash.includes("access_token=") ||
      hash.includes("id_token=") ||
      hash.includes("error_description=") ||
      href.endsWith("#") ||
      href.includes("/#")
    ) {
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  };

  // ── Theme & Store Name & Period & Auth & Demo init ──────────────────
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("catetin-theme") || "dark";
    setTheme(savedTheme);
    document.documentElement.classList.toggle("dark", savedTheme === "dark");

    const savedPeriod = localStorage.getItem("catetin-period") || "all";
    setActivePeriod(savedPeriod);

    // Register Service Worker for PWA
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service Worker registration failed: ", err);
      });
    }

    // Clean any trailing hash on mount
    cleanAuthHash();

    // ── visualViewport keyboard detection ──────────────────────────
    // Per spec: use visualViewport as single source of truth, not resize event
    const vv = window.visualViewport;
    if (vv) {
      const KEYBOARD_THRESHOLD = 150; // px shrink to classify as keyboard open
      const handleViewportResize = () => {
        const windowHeight = window.innerHeight;
        const viewportHeight = vv.height;
        const isKbOpen = (windowHeight - viewportHeight) > KEYBOARD_THRESHOLD;

        // Cancel any pending timers
        clearTimeout(keyboardTimerRef.current);
        clearTimeout(bottomNavTimerRef.current);

        if (isKbOpen) {
          // Keyboard opened: hide bottom nav IMMEDIATELY, no flicker
          setKeyboardOpen(true);
          setBottomNavVisible(false);
        } else {
          // Keyboard closed: update keyboardOpen right away for layout,
          // but delay showing bottom nav 200ms to avoid layout jump
          setKeyboardOpen(false);
          bottomNavTimerRef.current = setTimeout(() => {
            setBottomNavVisible(true);
          }, 200);
        }
      };
      vv.addEventListener("resize", handleViewportResize);
      vv.addEventListener("scroll", handleViewportResize);
      const cleanupVV = () => {
        vv.removeEventListener("resize", handleViewportResize);
        vv.removeEventListener("scroll", handleViewportResize);
        clearTimeout(keyboardTimerRef.current);
        clearTimeout(bottomNavTimerRef.current);
      };
      window.__catVVCleanup = cleanupVV;
    }

    const isDemoMode = localStorage.getItem("catetin-demo") === "true";
    setIsDemo(isDemoMode);

    if (isDemoMode) {
      setTransactions(getDemoTransactions().map(dbToApp));
      setStoreName("Kedai Kopi Bahagia");
      setShowLanding(false);
      setLoading(false);
      setAuthLoading(false);
    }

    // Failsafe timeout: if auth doesn't resolve within 5 seconds, force-unlock the UI
    const authTimeoutId = setTimeout(() => {
      setAuthLoading((prev) => {
        if (prev) {
          console.warn("[AUTH_TIMEOUT_FALLBACK] Auth did not resolve in 5s, forcing authLoading=false");
          return false;
        }
        return prev;
      });
    }, 5000);

    // Single consolidated auth changes listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      console.log(`[AUTH_EVENT_RECEIVED] event: ${event}, user: ${currentUser ? currentUser.id : 'null'}`);

      // Clear the failsafe timeout since we got a response
      clearTimeout(authTimeoutId);

      if (event === "TOKEN_REFRESHED") {
        console.log("[TOKEN_REFRESHED] Token refreshed, updating user ref");
        if (currentUser) {
          setUser(currentUser);
        }
        return;
      }

      if (currentUser) {
        // ── User is authenticated (INITIAL_SESSION with session, or SIGNED_IN) ──
        console.log(`[${event}] User authenticated: ${currentUser.id}`);
        setUser(currentUser);
        setShowLanding(false);
        setAuthLoading(false);
        console.log("[AUTH_LOADING_FALSE] auth resolved with user");

        // Prevent double initialization for the same user
        if (lastProcessedUserIdRef.current === currentUser.id) {
          return;
        }
        lastProcessedUserIdRef.current = currentUser.id;

        setIsDemo(false);
        localStorage.removeItem("catetin-demo");

        // Trigger first-time store profile fetch/migration
        const savedStore = localStorage.getItem("catetin-store-name");
        const profile = await fetchOrCreateProfile(currentUser.id, savedStore);
        if (profile && profile.store_name && profile.store_name !== "Toko Baru") {
          setStoreName(profile.store_name);
          localStorage.setItem("catetin-store-name", profile.store_name);
        } else {
          setShowSetup(true);
        }

        const guestId = localStorage.getItem("catetin-guest-id");
        if (guestId) {
          toast.promise(migrateGuestTransactions(guestId, currentUser.id), {
            loading: "Memindahkan data transaksi lokal ke akun Anda...",
            success: (res) => {
              if (res.success && res.migratedCount > 0) {
                localStorage.removeItem("catetin-guest-id");
                fetchTransactions(currentUser.id);
                return `Data berhasil dipindahkan! (${res.migratedCount} transaksi)`;
              }
              fetchTransactions(currentUser.id);
              return "Pemindahan data selesai.";
            },
            error: "Gagal memindahkan data transaksi lokal.",
          });
        } else {
          fetchTransactions(currentUser.id);
        }

        // Cleanup OAuth hash and credentials immediately
        cleanAuthHash();
        setShowLoginModal(false);
      } else {
        // ── No user (INITIAL_SESSION without session, or SIGNED_OUT) ──
        console.log(`[${event}] No authenticated user`);
        setUser(null);
        lastProcessedUserIdRef.current = null;

        if (event === "SIGNED_OUT") {
          setIsDemo(false);
          localStorage.removeItem("catetin-demo");
          localStorage.removeItem("catetin-store-name");
          setStoreName("");
          setShowLanding(true);
          fetchTransactions(null);
          cleanAuthHash();
        } else {
          // INITIAL_SESSION with no user — check for guest/local state
          const savedStore = localStorage.getItem("catetin-store-name");
          if (savedStore) {
            setStoreName(savedStore);
            setShowLanding(false);
          } else {
            setShowLanding(true);
          }
          fetchTransactions(null);
        }

        setAuthLoading(false);
        console.log("[AUTH_LOADING_FALSE] auth resolved without user");
      }
    });

    return () => {
      clearTimeout(authTimeoutId);
      subscription.unsubscribe();
      if (window.__catVVCleanup) {
        window.__catVVCleanup();
        delete window.__catVVCleanup;
      }
    };
  }, []);

  // Handle Supabase profiles realtime synchronization and profile fetching
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id || isDemo) return;

    const userId = user.id;

    const syncProfile = async () => {
      try {
        const guestStore = localStorage.getItem("catetin-store-name");
        const profile = await fetchOrCreateProfile(userId, guestStore);
        if (profile && profile.store_name) {
          setStoreName(profile.store_name);
          localStorage.setItem("catetin-store-name", profile.store_name);
        }
      } catch (err) {
        console.error("Error syncing profile on user state change:", err);
      }
    };

    syncProfile();

    profileChannelRef.current = supabase
      .channel(`profile-sync-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          console.log("Realtime profile sync event:", payload);
          if (payload.new && payload.new.store_name) {
            setStoreName(payload.new.store_name);
            localStorage.setItem("catetin-store-name", payload.new.store_name);
          }
        },
      )
      .subscribe((status) => {
        console.log(
          `Realtime profiles subscription status for ${userId}:`,
          status,
        );
      });

    return () => {
      if (profileChannelRef.current) {
        console.log(`Cleaning up realtime profile channel for ${userId}`);
        supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, [user?.id, isDemo]);

  const handleStoreNameComplete = async (name) => {
    // 1. Optimistic Update: instantly update local state & cache
    setStoreName(name);
    localStorage.setItem("catetin-store-name", name);
    setShowSetup(false);
    setShowEditSetup(false);

    // 2. Cloud Sync if user is authenticated and not in demo mode
    if (user && !isDemo) {
      const res = await updateProfileStoreName(user.id, name);
      if (!res.success) {
        toast.error("Gagal menyinkronkan nama usaha ke server.", {
          description: res.error || "Silakan periksa koneksi internet Anda.",
        });

        // Revert local cache/state to actual database value if sync failed
        const profile = await fetchOrCreateProfile(user.id, null);
        if (profile && profile.store_name) {
          setStoreName(profile.store_name);
          localStorage.setItem("catetin-store-name", profile.store_name);
        }
      }
    }
  };

  // Handle body scroll locking when mobile chat is active
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleScrollLock = () => {
      const isMobile = window.innerWidth < 1024; // lg breakpoint
      if (isMobile && activeTab === "chat") {
        document.body.classList.add("no-scroll");
        const isIOS =
          /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
          document.body.classList.add("no-scroll-ios");
        }
      } else {
        document.body.classList.remove("no-scroll", "no-scroll-ios");
      }
    };

    handleScrollLock();
    window.addEventListener("resize", handleScrollLock);

    return () => {
      document.body.classList.remove("no-scroll", "no-scroll-ios");
      window.removeEventListener("resize", handleScrollLock);
    };
  }, [activeTab]);

  async function fetchTransactions(userId = null) {
    if (localStorage.getItem("catetin-demo") === "true") {
      setTransactions(getDemoTransactions().map(dbToApp));
      setLoading(false);
      return;
    }
    setLoading(true);
    let currentUserId = userId;
    if (!currentUserId) {
      const { data: userData } = await supabase.auth.getUser();
      currentUserId = userData?.user?.id;
    }
    const isAuth = !!currentUserId;
    const query = supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });
    const { data, error } = isAuth
      ? await query.eq("user_id", currentUserId)
      : await query.eq("session_id", getGuestId());

    if (error) {
      const { title, message } = mapAppError(error, "SUPABASE");
      toast.error(title, { description: message });
    } else {
      setTransactions((data ?? []).map(dbToApp));
    }
    setLoading(false);
  }

  const handleSaveReceiptTransactions = async (newTxs) => {
    if (localStorage.getItem("catetin-demo") === "true") {
      const mappedList = newTxs.map((tx, idx) => ({
        id: `demo-sim-${Date.now()}-${idx}`,
        type: tx.type,
        item: tx.item,
        category: tx.category ?? "other",
        amount: tx.amount,
        qty: tx.qty ?? 1,
        unit: tx.unit ?? null,
        createdAt: new Date().toISOString(),
        time: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
      setTransactions((prev) => [...mappedList, ...prev]);
      setShowScanner(false);
      toast.success(`${newTxs.length} transaksi demo berhasil disimpan.`);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const guestId = getGuestId();

    const insertPayloads = newTxs.map((tx) => ({
      ...appToDb(tx),
      ...(userId ? { user_id: userId } : { session_id: guestId }),
    }));

    const { data, error } = await supabase
      .from("transactions")
      .insert(insertPayloads)
      .select();

    if (error) {
      const { title, message } = mapAppError(error, "SUPABASE");
      toast.error(title, { description: message });
      return;
    }

    const mapped = (data ?? []).map(dbToApp);
    setTransactions((prev) => [...mapped, ...prev]);
    setShowScanner(false);
    toast.success(`${newTxs.length} transaksi berhasil disimpan dari struk.`);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("catetin-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  // ── Add transaction → INSERT ─────────────────────────────────────
  const handleAddTransaction = async (newTx) => {
    if (localStorage.getItem("catetin-demo") === "true") {
      const mapped = {
        id: `demo-sim-${Date.now()}`,
        type: newTx.type,
        item: newTx.item,
        category: newTx.category ?? "other",
        amount: newTx.amount,
        qty: newTx.qty ?? 1,
        unit: newTx.unit ?? null,
        createdAt: new Date().toISOString(),
        time: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setTransactions((prev) => [mapped, ...prev]);
      setNewestId(mapped.id);
      setTimeout(() => {
        setNewestId((curr) => (curr === mapped.id ? null : curr));
      }, 3000);

      toast.success("Catatan Demo berhasil disimpan", {
        description: `${
          newTx.type === "income" ? "Pemasukan" : "Pengeluaran"
        }: ${newTx.item} (${formatRupiah(newTx.amount)})`,
      });
      return;
    }

    // Resolve ownership before insert
    const { data: userData } = await supabase.auth.getUser();
    const insertPayload = {
      ...appToDb(newTx),
      ...(userData?.user?.id
        ? { user_id: userData.user.id }
        : { session_id: getGuestId() }),
    };
    const { data, error } = await supabase
      .from("transactions")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      const { title, message } = mapAppError(error, "SUPABASE");
      toast.error(title, { description: message });
      return;
    }

    const mapped = dbToApp(data);
    setTransactions((prev) => [mapped, ...prev]);
    setNewestId(mapped.id);
    setTimeout(() => {
      setNewestId((curr) => (curr === mapped.id ? null : curr));
    }, 3000);

    toast.success("Catatan berhasil disimpan", {
      description: `${
        newTx.type === "income" ? "Pemasukan" : "Pengeluaran"
      }: ${newTx.item} (${formatRupiah(newTx.amount)})`,
    });
  };

  // ── Edit transaction → UPDATE ────────────────────────────────────
  const handleEditTransaction = async (id, updatedData) => {
    if (localStorage.getItem("catetin-demo") === "true") {
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                type: updatedData.type,
                item: updatedData.item,
                category: updatedData.category,
                amount: updatedData.amount,
                qty: updatedData.qty,
                unit: updatedData.unit,
              }
            : t,
        ),
      );
      toast.success("Transaksi Demo berhasil diperbarui");
      return;
    }

    const { error } = await supabase
      .from("transactions")
      .update({
        item_name: updatedData.item,
        amount: updatedData.amount,
        category: updatedData.category,
        type: updatedData.type,
        qty: updatedData.qty,
        unit: updatedData.unit,
      })
      .eq("id", id);

    if (error) {
      const { title, message } = mapAppError(error, "SUPABASE");
      toast.error(title, { description: message });
      return;
    }

    setTransactions((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              type: updatedData.type,
              item: updatedData.item,
              category: updatedData.category,
              amount: updatedData.amount,
              qty: updatedData.qty,
              unit: updatedData.unit,
            }
          : t,
      ),
    );
    toast.success("Transaksi berhasil diperbarui");
  };

  // ── Delete transaction → DELETE ──────────────────────────────────
  const handleDeleteTransaction = async (id) => {
    if (localStorage.getItem("catetin-demo") === "true") {
      const tx = transactions.find((t) => t.id === id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      if (tx) {
        toast.error("Transaksi Demo dihapus", {
          description: `${tx.item} telah dikeluarkan dari kas.`,
        });
      }
      return;
    }

    const tx = transactions.find((t) => t.id === id);
    const { error } = await supabase.from("transactions").delete().eq("id", id);

    if (error) {
      const { title, message } = mapAppError(error, "SUPABASE");
      toast.error(title, { description: message });
      return;
    }

    setTransactions((prev) => prev.filter((t) => t.id !== id));
    if (tx)
      toast.error("Transaksi dihapus", {
        description: `${tx.item} telah dikeluarkan dari kas.`,
      });
  };

  // ── Clear all → DELETE only this user/guest's rows ──────────────
  const handleClearTransactions = async () => {
    if (localStorage.getItem("catetin-demo") === "true") {
      setTransactions([]);
      toast.info("Buku Kas Demo berhasil dikosongkan");
      return;
    }

    // Resolve ownership — same logic as fetch & insert
    const { data: userData } = await supabase.auth.getUser();
    const isAuth = !!userData?.user?.id;

    const query = supabase.from("transactions").delete();
    const { error } = isAuth
      ? await query.eq("user_id", userData.user.id)
      : await query.eq("session_id", getGuestId());

    if (error) {
      const { title, message } = mapAppError(error, "SUPABASE");
      toast.error(title, { description: message });
      return;
    }

    setTransactions([]);
    toast.info("Buku Kas berhasil dikosongkan");
  };

  const handlePeriodChange = (period) => {
    setActivePeriod(period);
    localStorage.setItem("catetin-period", period);
  };

  // ── Filter transactions ──────────────────────────────────────────
  const filteredTransactions = transactions.filter((tx) => {
    if (activePeriod === "all") return true;
    const txDate = new Date(tx.createdAt || Date.now());
    const now = new Date();

    if (activePeriod === "today") {
      return txDate.toDateString() === now.toDateString();
    }
    if (activePeriod === "week") {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      return txDate >= sevenDaysAgo;
    }
    if (activePeriod === "month") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      return txDate >= thirtyDaysAgo;
    }
    return true;
  });

  const totalIncome = filteredTransactions
    .filter((tx) => tx.type === "income")
    .reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = filteredTransactions
    .filter((tx) => tx.type === "expense")
    .reduce((s, tx) => s + tx.amount, 0);
  const totalProfit = totalIncome - totalExpense;

  // 1. Initial hydration guard: Server and client initial render must be identical.
  if (!mounted) {
    if (typeof window === "undefined") {
      console.log("[SSR_RENDER] rendering initial loading shell");
    } else {
      console.log("[CLIENT_MOUNT] rendering initial loading shell during hydration");
    }
    return <div className="min-h-screen bg-[#0C0C0B]" />;
  }

  // 2. Auth Loading state (only shown on client after mounting, to avoid SSR mismatch)
  if (authLoading) {
    console.log(`[AUTH_LOADING] auth is still loading. user: ${user ? user.id : 'null'}`);
    return (
      <div className="min-h-screen w-full bg-[#FAF9F6] dark:bg-[#0C0C0B] flex flex-col items-center justify-center transition-colors duration-300 select-none">
        <div className="flex flex-col items-center gap-6 animate-fade-in">
          {/* Brand Logo / Icon */}
          <div className="relative">
            {/* Pulsing Outer Ring */}
            <div className="absolute -inset-4 rounded-full bg-emerald-500/10 dark:bg-emerald-500/5 blur-xl animate-pulse" style={{ animationDuration: '3s' }} />
            
            {/* Main Logo Container */}
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-stone-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 shadow-md">
              <BrainCircuit className="h-10 w-10 text-emerald-500 animate-pulse" />
            </div>
          </div>

          {/* Typography */}
          <div className="text-center space-y-2">
            <h2 className="text-lg font-black tracking-tight text-zinc-950 dark:text-white uppercase">
              Catetin<span className="text-emerald-500">.AI</span>
            </h2>
            <div className="flex items-center gap-1.5 justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              <p className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase animate-pulse">
                Menghubungkan Akun...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  console.log(`[SHOW_LANDING] showLanding: ${showLanding}, [USER_STATE] user: ${user ? user.id : 'null'}, [THEME_STATE] theme: ${theme}`);

  if (showLanding) {
    return (
      <>
        <LandingPage
          onStartGuest={() => {
            requestGuestOnboarding();
          }}
          onStartDemo={() => {
            setIsDemo(true);
            localStorage.setItem("catetin-demo", "true");
            setTransactions(getDemoTransactions().map(dbToApp));
            setStoreName("Kedai Kopi Bahagia");
            setShowLanding(false);
          }}
          onLogin={() => {
            setShowLoginModal(true);
          }}
        />
        {showLoginModal && (
          <LoginModal
            isOpen={showLoginModal}
            onClose={() => setShowLoginModal(false)}
            onContinueAsGuest={() => {
              setShowLoginModal(false);
              requestGuestOnboarding();
            }}
            isMigrating={false}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#FAF9F6] dark:bg-[#0C0C0B] transition-colors duration-300 font-sans">
      <Toaster
        position="top-center"
        richColors
        theme={theme === "dark" ? "dark" : "light"}
      />

      <Navbar
        theme={theme}
        onToggleTheme={toggleTheme}
        activeTab={activeTab}
        storeName={storeName}
        onExport={() => setShowExport(true)}
        user={user}
        onLogin={() => setShowLoginModal(true)}
        onLogout={async () => {
          if (!confirm("Apakah Anda ingin keluar dari akun?")) return;

          // Optimistic local logout: reset UI state immediately
          try {
            setUser(null);
            setShowLanding(true);
            setShowLoginModal(false);
            setShowSetup(false);
            setTransactions([]);

            // Unsubscribe from realtime/profile channel if any
            try {
              if (
                profileChannelRef.current &&
                typeof profileChannelRef.current.unsubscribe === "function"
              ) {
                profileChannelRef.current.unsubscribe();
              }
            } catch (e) {
              console.warn(
                "Failed to unsubscribe profile channel during logout:",
                e,
              );
            }

            // Inform user immediately
            toast.success("Berhasil keluar.");

            // Attempt remote sign out, but do not block or rollback UI if offline
            try {
              await signOut();
            } catch (err) {
              console.warn("signOut failed (continuing local logout):", err);
            }
          } catch (err) {
            console.error("Logout error:", err);
            toast.error("Gagal melakukan logout.");
          }
        }}
        onEditStoreName={() => setShowEditSetup(true)}
        onScanClick={() => setShowScanner(true)}
      />

      {isDemo && (
        <div className="fixed top-[72px] left-0 right-0 z-35 bg-amber-500/15 backdrop-blur-md border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-400 animate-fade-in shadow-xs">
          <div className="flex items-center gap-1.5 select-none">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
            <span>Mode Demo Aktif — Menggunakan simulasi data usaha UMKM.</span>
          </div>
          <button
            onClick={() => {
              setIsDemo(false);
              localStorage.removeItem("catetin-demo");

              // Restore original guest store name from localStorage or clear it
              const savedStore = localStorage.getItem("catetin-store-name");
              if (savedStore) {
                setStoreName(savedStore);
              } else {
                setStoreName("");
              }

              if (!user) {
                setShowLanding(true);
              }

              fetchTransactions(user?.id);
              toast.info("Kembali ke Buku Kas Anda.");
            }}
            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg active:scale-95 transition-all cursor-pointer text-[10px] font-extrabold uppercase tracking-wide shadow-2xs"
          >
            Keluar Demo
          </button>
        </div>
      )}

      {/* ── Mobile & Tablet (<1024px): full-width, bottom nav ── */}
      <div
        className={cn(
          "lg:hidden flex flex-col h-dvh fixed inset-0 overflow-hidden",
          isDemo ? "pt-[108px]" : "pt-[72px]",
          keyboardOpen ? "pb-0" : "pb-[68px]",
        )}
      >
        {activeTab === "chat" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <AIAssistant
              onAddTransaction={handleAddTransaction}
              onClearTransactions={handleClearTransactions}
              inline
              clearSignal={clearChatSignal}
              resetSignal={resetSignal}
              transactions={transactions}
              messages={chatMessages}
              setMessages={setChatMessages}
              onScanClick={() => setShowScanner(true)}
              keyboardOpen={keyboardOpen}
            />
          </div>
        )}

        {activeTab === "kas" && (
          <KasPanel
            transactions={filteredTransactions}
            allTransactions={transactions}
            loading={loading}
            totalIncome={totalIncome}
            totalExpense={totalExpense}
            totalProfit={totalProfit}
            onDeleteTransaction={handleDeleteTransaction}
            onEditTransaction={setEditingTx}
            activePeriod={activePeriod}
            onPeriodChange={handlePeriodChange}
            onExport={() => setShowExport(true)}
            newestId={newestId}
          />
        )}

        {/* Bottom nav — hides smoothly when keyboard is open, uses separate bottomNavVisible state */}
        <div
          className={cn(
            "shrink-0 z-40 backdrop-blur-lg bg-white/90 dark:bg-[#0E0E0E]/90 border-t border-stone-200/50 dark:border-zinc-800/60 px-8 py-3.5 flex items-center justify-around bottom-nav-transition",
            !bottomNavVisible && "bottom-nav-hidden",
          )}
          style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}
        >
          {[
            { id: "kas", label: "Buku Kas", Icon: BarChart3 },
            { id: "chat", label: "Asisten AI", Icon: Sparkles },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex flex-col items-center gap-1 cursor-pointer transition-all duration-300 active:scale-90",
                activeTab === id
                  ? "text-emerald-600 dark:text-emerald-400 font-extrabold scale-105"
                  : "text-zinc-400 dark:text-zinc-500 font-bold",
              )}
            >
              <Icon
                className={cn("h-5 w-5", activeTab === id && "animate-pulse")}
              />
              <span className="text-[10px] tracking-wide font-extrabold">
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop (≥1024px): sidebar kiri + konten ── */}
      <div
        className={cn(
          "hidden lg:flex h-screen",
          isDemo ? "pt-[108px]" : "pt-[72px]",
        )}
      >
        <DesktopSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onReset={() => {
            if (confirm("Reset seluruh data transaksi?")) {
              handleClearTransactions();
              setResetSignal((s) => s + 1);
            }
          }}
          onClearChat={() => {
            if (confirm("Hapus seluruh percakapan asisten?")) {
              setClearChatSignal((s) => s + 1);
            }
          }}
        />

        <div className="flex flex-1 overflow-hidden">
          <div
            className={cn(
              "flex flex-col border-r border-stone-200/50 dark:border-zinc-800/60 transition-all duration-300",
              activeTab === "kas" ? "w-0 overflow-hidden opacity-0" : "flex-1",
            )}
          >
            <AIAssistant
              onAddTransaction={handleAddTransaction}
              onClearTransactions={handleClearTransactions}
              inline
              clearSignal={clearChatSignal}
              resetSignal={resetSignal}
              transactions={transactions}
              messages={chatMessages}
              setMessages={setChatMessages}
              onScanClick={() => setShowScanner(true)}
            />
          </div>

          <div
            className={cn(
              "flex flex-col overflow-hidden transition-all duration-300",
              activeTab === "chat" ? "w-0 overflow-hidden opacity-0" : "flex-1",
            )}
          >
            <KasPanel
              transactions={filteredTransactions}
              allTransactions={transactions}
              loading={loading}
              totalIncome={totalIncome}
              totalExpense={totalExpense}
              totalProfit={totalProfit}
              onDeleteTransaction={handleDeleteTransaction}
              onEditTransaction={setEditingTx}
              activePeriod={activePeriod}
              onPeriodChange={handlePeriodChange}
              onExport={() => setShowExport(true)}
              newestId={newestId}
            />
          </div>
        </div>
      </div>

      {/* Modals & Panels */}
      {showScanner && (
        <ReceiptScanner
          onSave={handleSaveReceiptTransactions}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showSetup && <StoreSetupModal onComplete={handleStoreNameComplete} />}

      {showEditSetup && (
        <StoreSetupModal
          initialValue={storeName}
          onClose={() => setShowEditSetup(false)}
          onComplete={async (name) => {
            await handleStoreNameComplete(name);
            toast.success("Nama usaha berhasil diperbarui!");
          }}
        />
      )}

      {editingTx && (
        <EditTransactionModal
          tx={editingTx}
          onSave={handleEditTransaction}
          onClose={() => setEditingTx(null)}
        />
      )}

      {showExport && (
        <ExportPanel
          transactions={filteredTransactions}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          totalProfit={totalProfit}
          period={activePeriod}
          storeName={storeName}
          onClose={() => setShowExport(false)}
        />
      )}

      {showLoginModal && (
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onContinueAsGuest={() => {
            setShowLoginModal(false);
            if (!localStorage.getItem("catetin-guest-id")) {
              getGuestId();
            }
          }}
          isMigrating={!!localStorage.getItem("catetin-guest-id")}
        />
      )}
    </div>
  );
}
