"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import {
  Plus,
  Minus,
  Trash2,
  Pencil,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import type { MenuItem } from "@/types";

interface MealCardProps {
  item: MenuItem;
  imageUrl: string | null;
  variant: "client" | "restaurant";
  inCartQty?: number;
  onAddToCart?: () => void;
  onUpdateQty?: (delta: number) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function MealCard({
  item,
  imageUrl,
  variant,
  inCartQty = 0,
  onAddToCart,
  onUpdateQty,
  onEdit,
  onDelete,
}: MealCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleImageLoad = useCallback(() => setImgLoaded(true), []);
  const handleImageError = useCallback(() => {
    setImgError(true);
    setImgLoaded(true);
  }, []);

  const hasImage = !!imageUrl && !imgError;

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-gray-700 dark:bg-gray-800 ${
        variant === "client" ? "h-full" : ""
      }`}
    >
      {/* Image area */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-700">
        {!imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700" />
        )}
        {hasImage ? (
          <Image
            src={imageUrl}
            alt={item.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={`object-cover transition-transform duration-500 group-hover:scale-105 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
            priority={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-gray-300 dark:text-gray-500">
              <UtensilsCrossed size={32} />
              <span className="text-xs font-medium">لا توجد صورة</span>
            </div>
          </div>
        )}

        {/* Price badge */}
        <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-green-700 shadow-sm backdrop-blur-sm dark:bg-gray-900/90 dark:text-green-400">
          {Number(item.price).toFixed(2)} ر.س
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-1 text-base font-bold text-gray-800 dark:text-gray-100">
          {item.name}
        </h3>
        {item.description && (
          <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {item.description}
          </p>
        )}

        <div className="mt-auto pt-2">
          {variant === "client" && (
            <>
              {inCartQty > 0 ? (
                <div className="flex items-center justify-center gap-3 rounded-xl bg-gray-50 p-2 dark:bg-gray-700/50">
                  <button
                    onClick={() => onUpdateQty?.(1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-white transition-colors hover:bg-green-700"
                    aria-label="زيادة الكمية"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="min-w-[1.5rem] text-center text-base font-bold text-gray-800 dark:text-gray-100">
                    {inCartQty}
                  </span>
                  <button
                    onClick={() => onUpdateQty?.(-1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-300 text-gray-500 transition-colors hover:border-red-400 hover:text-red-500 dark:border-gray-500 dark:text-gray-400"
                    aria-label="تقليل الكمية"
                  >
                    {inCartQty === 1 ? (
                      <Trash2 size={12} />
                    ) : (
                      <Minus size={14} />
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={onAddToCart}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800 active:scale-[0.98] dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <ShoppingBag size={15} />
                  أضف للسلة
                </button>
              )}
            </>
          )}

          {variant === "restaurant" && (
            <div className="flex items-center gap-2">
              <button
                onClick={onEdit}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                <Pencil size={12} />
                تعديل
              </button>
              <button
                onClick={onDelete}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-100 bg-red-50 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                <Trash2 size={12} />
                حذف
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
