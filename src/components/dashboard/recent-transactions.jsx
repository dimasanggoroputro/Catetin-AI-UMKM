"use client";

import { useState } from "react";
import {
  Coffee,
  ShoppingBag,
  CreditCard,
  Coins,
  Home,
  Receipt,
  PlusCircle,
  Trash2,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";

// ─── Category config ─────────────────────────────────────────────
const CATEGORY_ALIAS = {
  food: "food",
  makanan: "food",
  minuman: "food",
  "f&b": "food",
  shopping: "shopping",
  belanja: "shopping",
  operasional: "shopping",
  "bahan baku": "shopping",
  bills: "bills",
  listrik: "bills",
  air: "bills",
  pulsa: "bills",
  salary: "salary",
  gaji: "salary",
  karyawan: "salary",
  rent: "rent",
  sewa: "rent",
  toko: "rent",
};

const CATEGORY_MAP = {
  food: {
    Icon: Coffee,
    style:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/15",
    label: "Kuliner",
  },
  shopping: {
    Icon: ShoppingBag,
    style: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/15",
    label: "Belanja",
  },
  bills: {
    Icon: CreditCard,
    style:
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/15",
    label: "Tagihan",
  },
  salary: {
    Icon: Coins,
    style:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/15",
    label: "Operasional",
  },
  rent: {
    Icon: Home,
    style:
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/15",
    label: "Tempat",
  },
  other: {
    Icon: Receipt,
    style: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/15",
    label: "Lainnya",
  },
};

function getCategoryConfig(category) {
  const key = CATEGORY_ALIAS[category?.toLowerCase()] ?? "other";
  const config = CATEGORY_MAP[key] ?? CATEGORY_MAP.other;
  return key === "other" && category ? { ...config, label: category } : config;
}

// ─── Empty State ─────────────────────────────────────────────────
function EmptyState({ isFiltered }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-2xl border border-dashed border-stone-200 dark:border-zinc-800/60 bg-gradient-to-b from-white/60 to-stone-50/30 dark:from-zinc-900/20 dark:to-zinc-950/10">
      <div className="relative mb-5">
        <div
          className="absolute -inset-3 rounded-full bg-emerald-500/8 dark:bg-emerald-500/5 blur-lg animate-pulse"
          style={{ animationDuration: "4s" }}
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-stone-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
          {isFiltered ? (
            <Search className="h-7 w-7 text-zinc-300 dark:text-zinc-600" />
          ) : (
            <Receipt className="h-7 w-7 text-zinc-300 dark:text-zinc-600" />
          )}
        </div>
      </div>
      <h4 className="text-sm font-black text-zinc-800 dark:text-white tracking-tight">
        {isFiltered ? "Tidak Ditemukan" : "Belum Ada Transaksi"}
      </h4>
      <p className="mt-2 text-xs font-medium text-zinc-400 dark:text-zinc-500 max-w-[260px] leading-relaxed">
        {isFiltered
          ? "Coba kata kunci lain atau ubah filter kategori Bos."
          : "Buku kas toko Bos masih bersih. Yuk mulai catat pemasukan pertama lewat Asisten AI!"}
      </p>
      {!isFiltered && (
        <div className="mt-5 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/8 dark:bg-emerald-500/5 border border-emerald-500/10">
          <PlusCircle className="h-3.5 w-3.5 text-emerald-500 animate-pulse" />
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 italic">
            &quot;jual kopi susu 5 gelas 75 ribu&quot;
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Transaction Row ─────────────────────────────────────────────
function TransactionRow({ tx, onDelete, onEdit, isNew }) {
  const { Icon, style, label } = getCategoryConfig(tx.category);
  const isIncome = tx.type === "income";

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [swiping, setSwiping] = useState(false);

  const handleTouchStart = (e) => {
    if (swipeOffset < 0) {
      setSwipeOffset(0);
      setSwiping(false);
      return;
    }
    setTouchStart(e.touches[0].clientX);
    setSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!swiping) return;
    const diff = e.touches[0].clientX - touchStart;
    if (diff < 0) {
      setSwipeOffset(Math.max(-80, diff));
    } else {
      setSwipeOffset(0);
    }
  };

  const handleTouchEnd = () => {
    setSwiping(false);
    if (swipeOffset < -45) {
      setSwipeOffset(-72);
    } else {
      setSwipeOffset(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background Swipe Delete Action */}
      <div
        onClick={() => onDelete?.(tx.id)}
        className="absolute inset-0 bg-rose-500 flex items-center justify-end px-5 text-white font-extrabold text-xs cursor-pointer active:bg-rose-600 transition-colors"
      >
        <div className="flex flex-col items-center gap-0.5 select-none">
          <Trash2 className="h-4 w-4" />
          <span>Hapus</span>
        </div>
      </div>

      {/* Foreground Container */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        className={cn(
          "relative group flex items-center justify-between p-3 rounded-xl border border-stone-150/80 dark:border-zinc-900/60 bg-white dark:bg-zinc-900 shadow-3xs",
          !swiping && "transition-transform duration-200 ease-out",
          isNew && "animate-highlight-new",
        )}
      >
        {/* Left: icon + info */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-3xs",
              style,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-zinc-900 dark:text-white leading-tight truncate">
              {tx.item}
            </span>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                {label}
              </span>
              {(tx.unit || tx.qty > 1) && (
                <>
                  <span className="text-[10px] text-zinc-300 dark:text-zinc-700">
                    •
                  </span>
                  <span className="text-[10px] font-extrabold text-zinc-400 dark:text-zinc-500">
                    {tx.unit ? `${tx.qty}${tx.unit}` : `${tx.qty} pcs`}
                  </span>
                </>
              )}
              <span className="text-[10px] text-zinc-300 dark:text-zinc-700">
                •
              </span>
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                {tx.time || "Hari ini"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: amount + actions */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span
            className={cn(
              "text-sm font-extrabold tracking-tight",
              isIncome
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-800 dark:text-zinc-200",
            )}
          >
            {isIncome ? "+" : "−"}
            {formatRupiah(tx.amount)}
          </span>

          <button
            onClick={() => onEdit?.(tx)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-500 transition-all cursor-pointer active:scale-90 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>

          {/* Delete */}
          <button
            onClick={() => onDelete?.(tx.id)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer active:scale-90"
            title="Hapus"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category filter chips ────────────────────────────────────────
const FILTER_CHIPS = [
  { id: "all", label: "Semua" },
  { id: "income", label: "Pemasukan" },
  { id: "expense", label: "Pengeluaran" },
  { id: "food", label: "Kuliner" },
  { id: "shopping", label: "Belanja" },
  { id: "bills", label: "Tagihan" },
  { id: "salary", label: "Operasional" },
  { id: "rent", label: "Tempat" },
  { id: "other", label: "Lainnya" },
];

// ─── Main ─────────────────────────────────────────────────────────
export default function RecentTransactions({
  transactions = [],
  onDeleteTransaction,
  onEditTransaction,
  newestId = null,
}) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  // Apply search + type/category filter
  const filtered = transactions.filter((tx) => {
    const matchSearch =
      !search.trim() || tx.item.toLowerCase().includes(search.toLowerCase());

    const matchFilter =
      activeFilter === "all"
        ? true
        : activeFilter === "income"
          ? tx.type === "income"
          : activeFilter === "expense"
            ? tx.type === "expense"
            : tx.category === activeFilter;

    return matchSearch && matchFilter;
  });

  const isFiltered = search.trim().length > 0 || activeFilter !== "all";

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold tracking-wider uppercase text-zinc-400 dark:text-zinc-500">
          Transaksi
        </h3>
        {transactions.length > 0 && (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border border-stone-200/40 dark:border-zinc-800/40">
            {filtered.length}/{transactions.length}
          </span>
        )}
      </div>

      {/* Search bar */}
      {transactions.length > 0 && (
        <div className="relative mb-2.5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari transaksi..."
            className="w-full rounded-xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-8 pr-8 py-2.5 text-sm font-medium text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/40 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-500 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Category filter chips */}
      {transactions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-2.5 -mx-0.5 px-0.5">
          {FILTER_CHIPS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              className={cn(
                "shrink-0 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide border transition-all duration-200 cursor-pointer active:scale-95",
                activeFilter === id
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white"
                  : "bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-stone-200 dark:border-zinc-800 hover:border-zinc-400",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState isFiltered={isFiltered} />
      ) : (
        <div className="space-y-2">
          {filtered.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              isNew={tx.id === newestId}
              onDelete={onDeleteTransaction}
              onEdit={onEditTransaction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
