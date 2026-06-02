"use client";

import { useState, useRef, useEffect } from "react";
import { X, Check, Trash2, Plus, AlertCircle, ShoppingBag, Coffee, CreditCard, Coins, Home, Receipt, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { id: "food",     label: "Kuliner",     Icon: Coffee,      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", dotColor: "bg-emerald-500" },
  { id: "shopping", label: "Belanja",     Icon: ShoppingBag, color: "text-blue-500 bg-blue-500/10 border-blue-500/20", dotColor: "bg-blue-500" },
  { id: "bills",    label: "Tagihan",     Icon: CreditCard,  color: "text-purple-500 bg-purple-500/10 border-purple-500/20", dotColor: "bg-purple-500" },
  { id: "salary",   label: "Operasional", Icon: Coins,       color: "text-amber-500 bg-amber-500/10 border-amber-500/20", dotColor: "bg-amber-500" },
  { id: "rent",     label: "Tempat",      Icon: Home,        color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20", dotColor: "bg-indigo-500" },
  { id: "other",    label: "Lainnya",     Icon: Receipt,     color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20", dotColor: "bg-zinc-500" },
];

const formatNumberString = (value) => {
  if (value === undefined || value === null || value === "") return "";
  const clean = value.toString().replace(/\D/g, "");
  if (!clean) return "";
  return new Intl.NumberFormat("id-ID").format(Number(clean));
};

const parseNumberString = (formattedValue) => {
  if (formattedValue === undefined || formattedValue === null || formattedValue === "") return "";
  return formattedValue.toString().replace(/\D/g, "");
};

// Animated collapsible wrapper
function CollapsiblePanel({ isOpen, children }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isOpen ? contentRef.current.scrollHeight : 0);
    }
  }, [isOpen]);

  // Re-measure on content changes while open
  useEffect(() => {
    if (isOpen && contentRef.current) {
      const observer = new ResizeObserver(() => {
        setHeight(contentRef.current?.scrollHeight || 0);
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    }
  }, [isOpen]);

  return (
    <div
      className="overflow-hidden transition-all duration-300 ease-in-out"
      style={{ maxHeight: isOpen ? `${height}px` : "0px", opacity: isOpen ? 1 : 0 }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

// Compact card header for collapsed state
function AccordionHeader({ item, index, isOpen, onToggle, onDelete, catConfig }) {
  const CatIcon = catConfig.Icon;
  const isExpense = item.type === "expense";
  const amountDisplay = formatNumberString(item.amount);

  return (
    <div
      onClick={onToggle}
      className={cn(
        "flex items-center gap-3 px-3.5 py-3 cursor-pointer select-none transition-all duration-200 group/header",
        isOpen
          ? "bg-stone-50/80 dark:bg-zinc-900/40"
          : "hover:bg-stone-50/50 dark:hover:bg-zinc-900/20"
      )}
    >
      {/* Category icon dot */}
      <div className={cn(
        "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
        catConfig.color
      )}>
        <CatIcon className="h-3.5 w-3.5" />
      </div>

      {/* Name & category label */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-xs font-bold text-zinc-900 dark:text-white truncate leading-tight",
          !item.item.trim() && "text-zinc-400 italic"
        )}>
          {item.item.trim() || `Item #${index + 1}`}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
            {catConfig.label}
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">|</span>
          <span className={cn(
            "text-[9px] font-extrabold uppercase tracking-wider",
            isExpense ? "text-rose-500" : "text-emerald-500"
          )}>
            {isExpense ? "Pengeluaran" : "Pemasukan"}
          </span>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0 mr-1">
        <p className={cn(
          "text-xs font-black tabular-nums",
          isExpense ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
        )}>
          {amountDisplay ? `Rp ${amountDisplay}` : "Rp 0"}
        </p>
        {(item.qty > 1 || (item.unit && item.unit !== "null")) && (
          <p className="text-[9px] font-bold text-zinc-400 mt-0.5">
            x{item.qty} {(!item.unit || item.unit === "null") ? "" : item.unit}
          </p>
        )}
      </div>

      {/* Chevron */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="text-zinc-400 transition-transform duration-300" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default function ReceiptPreview({ items = [], onSave, onCancel, merchantName }) {
  const [editedItems, setEditedItems] = useState(
    items.map((item, index) => ({
      id: `scanned-${index}-${Date.now()}`,
      item: item.item || item.item_name || "",
      qty: item.qty || 1,
      unit: (item.unit && item.unit !== "null") ? item.unit : "",
      amount: item.amount || 0,
      category: item.category || "other",
      type: item.type || "expense",
    }))
  );
  const [openId, setOpenId] = useState(null);

  // Auto-open the first item on mount if there are items
  useEffect(() => {
    if (editedItems.length > 0 && openId === null) {
      setOpenId(editedItems[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFieldChange = (id, field, value) => {
    setEditedItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleDeleteItem = (id) => {
    setEditedItems((prev) => prev.filter((item) => item.id !== id));
    if (openId === id) setOpenId(null);
  };

  const handleAddItem = () => {
    const newId = `manual-add-${Date.now()}`;
    const newItem = {
      id: newId,
      item: "",
      qty: 1,
      unit: "",
      amount: "",
      category: "other",
      type: "expense",
    };
    setEditedItems((prev) => [...prev, newItem]);
    setOpenId(newId); // auto-open the new item
  };

  const toggleAccordion = (id) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  const totalAmount = editedItems.reduce((acc, curr) => {
    const amt = Number(curr.amount) || 0;
    return acc + amt;
  }, 0);

  const isFormValid =
    editedItems.length > 0 &&
    editedItems.every((item) => item.item.trim().length > 0 && Number(item.amount) > 0);

  const handleSaveAll = () => {
    if (!isFormValid) return;
    const finalItems = editedItems.map((item) => ({
      item: item.item.trim(),
      qty: Number(item.qty) || 1,
      unit: item.unit.trim() || null,
      amount: Number(item.amount),
      category: item.category,
      type: item.type,
      createdAt: new Date().toISOString(),
    }));
    onSave(finalItems);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200/50 dark:border-zinc-900/60 shrink-0">
        <div>
          <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white leading-tight">
            Review Hasil Scan AI
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {merchantName && (
              <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Toko: {merchantName}
              </p>
            )}
            {editedItems.length > 0 && (
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
                {editedItems.length} item terdeteksi
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onCancel}
          className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-stone-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Accordion Item List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-3 space-y-2">
        {editedItems.length === 0 ? (
          <div className="text-center py-10">
            <AlertCircle className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
            <p className="text-xs text-zinc-500 font-bold">Tidak ada transaksi yang terdeteksi.</p>
            <p className="text-[10px] text-zinc-400 mt-1">Bos bisa menambahkan item baru secara manual.</p>
          </div>
        ) : (
          editedItems.map((item, idx) => {
            const catConfig = CATEGORIES.find((c) => c.id === item.category) || CATEGORIES[5];
            const isOpen = openId === item.id;

            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-2xl border overflow-hidden transition-all duration-300",
                  isOpen
                    ? "border-emerald-500/30 dark:border-emerald-500/20 shadow-sm shadow-emerald-500/5"
                    : "border-stone-200/60 dark:border-zinc-800 hover:border-stone-300/80 dark:hover:border-zinc-700"
                )}
              >
                {/* Collapsed Header */}
                <AccordionHeader
                  item={item}
                  index={idx}
                  isOpen={isOpen}
                  onToggle={() => toggleAccordion(item.id)}
                  onDelete={() => handleDeleteItem(item.id)}
                  catConfig={catConfig}
                />

                {/* Expanded Edit Form */}
                <CollapsiblePanel isOpen={isOpen}>
                  <div className="px-3.5 pb-4 pt-2 border-t border-stone-100 dark:border-zinc-800/80 bg-stone-50/30 dark:bg-zinc-900/10">
                    <div className="grid grid-cols-12 gap-3">
                      {/* Item Name */}
                      <div className="col-span-12 sm:col-span-6">
                        <label className="block">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1 block">
                            Nama Item
                          </span>
                          <input
                            type="text"
                            value={item.item}
                            onChange={(e) => handleFieldChange(item.id, "item", e.target.value)}
                            placeholder="cth: Gula Pasir"
                            className="w-full rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-semibold text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                          />
                        </label>
                      </div>

                      {/* Amount */}
                      <div className="col-span-6 sm:col-span-3">
                        <label className="block">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1 block">
                            Jumlah (Rp)
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatNumberString(item.amount)}
                            onChange={(e) => {
                              const parsed = parseNumberString(e.target.value);
                              handleFieldChange(item.id, "amount", parsed);
                            }}
                            placeholder="0"
                            className="w-full rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-semibold text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                          />
                        </label>
                      </div>

                      {/* Qty */}
                      <div className="col-span-3 sm:col-span-2">
                        <label className="block">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1 block">
                            Qty
                          </span>
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleFieldChange(item.id, "qty", Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-semibold text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                          />
                        </label>
                      </div>

                      {/* Unit */}
                      <div className="col-span-3 sm:col-span-1">
                        <label className="block">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1 block">
                            Unit
                          </span>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleFieldChange(item.id, "unit", e.target.value)}
                            placeholder="pcs"
                            maxLength={5}
                            className="w-full rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-semibold text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all text-center"
                          />
                        </label>
                      </div>

                      {/* Category Selector */}
                      <div className="col-span-12">
                        <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1.5 block">
                          Kategori
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {CATEGORIES.map((cat) => {
                            const isSelected = item.category === cat.id;
                            return (
                              <button
                                key={cat.id}
                                onClick={() => handleFieldChange(item.id, "category", cat.id)}
                                className={cn(
                                  "px-2.5 py-1.5 rounded-full text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer active:scale-95",
                                  isSelected
                                    ? cat.color
                                    : "bg-white dark:bg-zinc-900 border-stone-200 dark:border-zinc-800 text-zinc-500 hover:border-stone-300"
                                )}
                              >
                                <cat.Icon className="h-3 w-3 shrink-0" />
                                {cat.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Type Selector & Delete Button */}
                      <div className="col-span-12 pt-1 border-t border-stone-100 dark:border-zinc-900/50 mt-1 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 mb-1.5 block">
                            Tipe Transaksi
                          </span>
                          <div className="flex gap-2 w-fit">
                            {[
                              { id: "expense", label: "Pengeluaran", color: "bg-rose-500 text-white animate-fade-in" },
                              { id: "income", label: "Pemasukan", color: "bg-emerald-500 text-white animate-fade-in" },
                            ].map((t) => (
                              <button
                                key={t.id}
                                onClick={() => handleFieldChange(item.id, "type", t.id)}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-[9px] font-extrabold tracking-wide uppercase transition-all cursor-pointer active:scale-95",
                                  item.type === t.id
                                    ? t.color
                                    : "bg-stone-200/40 dark:bg-zinc-800/50 text-zinc-500 hover:bg-stone-200/70"
                                )}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="self-end">
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/55 bg-rose-500/5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px] font-extrabold uppercase tracking-wide transition-all cursor-pointer active:scale-95"
                            title="Hapus Item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus Item
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsiblePanel>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Footer */}
      <div className="p-4 sm:p-5 border-t border-stone-200/50 dark:border-zinc-900/60 bg-stone-50/80 dark:bg-zinc-950/80 backdrop-blur-md shrink-0 space-y-3 safe-area-bottom pb-5 sticky bottom-0 z-10">
        {editedItems.length > 0 && (
          <div className="flex justify-between items-center px-1">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Total {editedItems.length} Item:</span>
            <span className="text-sm font-black text-zinc-900 dark:text-white">
              {formatNumberString(totalAmount) ? `Rp ${formatNumberString(totalAmount)}` : "Rp 0"}
            </span>
          </div>
        )}

        <div className="flex gap-3 mb-3">
          <button
            onClick={handleAddItem}
            className="flex-1 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 border border-stone-200/60 dark:border-zinc-700/80 hover:bg-zinc-200/70"
          >
            <Plus className="h-4 w-4" />
            Tambah Baris
          </button>

          <button
            onClick={handleSaveAll}
            disabled={!isFormValid}
            className={cn(
              "flex-1 py-3 rounded-2xl text-xs font-black tracking-wide transition-all flex items-center justify-center gap-1.5",
              isFormValid
                ? "bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer active:scale-95 shadow-md shadow-emerald-500/10"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed border border-transparent"
            )}
          >
            <Check className="h-4 w-4" />
            Simpan Transaksi
          </button>
        </div>
      </div>
    </div>
  );
}
