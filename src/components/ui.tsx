"use client";

import Link from "next/link";
import type { MatchStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

export function StatusBadge({ status }: { status: MatchStatus }) {
  const style =
    status === "done"
      ? "bg-court-100 text-court-800"
      : status === "in_progress"
        ? "bg-ball-500 text-court-950"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`chip ${style}`}>
      {status === "in_progress" && (
        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-court-900" />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

/** 参加者向けページの共通の外枠（ヘッダー + 戻る導線） */
export function PageShell({
  title,
  subtitle,
  children,
  backHref = "/",
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  backHref?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-24">
      {/* z-30: 表の固定列(z-10)より必ず前。下スクロール時に表がヘッダーに重ならないようにする */}
      <header className="sticky top-0 z-30 bg-court-800 text-white shadow-lg">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            href={backHref}
            aria-label="戻る"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-white/90 hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight">{title}</h1>
            {subtitle && <p className="truncate text-xs text-court-100">{subtitle}</p>}
          </div>
          {action}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
    </div>
  );
}

export function LoadingBlock({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="card flex items-center justify-center gap-3 p-10 text-court-700">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-court-200 border-t-court-600" />
      <span className="font-bold">{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card space-y-3 border-l-4 border-l-red-500 p-5">
      <p className="font-bold text-red-700">{message}</p>
      {onRetry && (
        <button className="btn-ghost btn-sm" onClick={onRetry}>
          もう一度読み込む
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-8 text-center">
      <p className="text-base font-bold text-court-800">{title}</p>
      {hint && <p className="mt-2 text-sm text-ink-500">{hint}</p>}
    </div>
  );
}

/** 「◯秒前に更新」を出す小さな表示。リアルタイムで動いていることが伝わる。 */
export function LiveDot({ updatedAt }: { updatedAt: Date | null }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-court-100">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-ball-400" />
      自動更新
      {updatedAt && (
        <span className="hidden sm:inline">
          {updatedAt.getHours()}:{String(updatedAt.getMinutes()).padStart(2, "0")}
        </span>
      )}
    </span>
  );
}
