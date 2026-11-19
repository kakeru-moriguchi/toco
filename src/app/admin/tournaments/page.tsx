"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell, Toast } from "@/components/AdminShell";
import { adminPost } from "@/lib/adminApi";
import { selectTournament, selectedTournamentId } from "@/lib/tournamentSelection";
import type { TournamentSummary } from "@/lib/types";
import { formatDate } from "@/lib/view";

const PHASE_LABEL = {
  setup: "準備中",
  league: "開催中（予選）",
  bracket: "開催中（決勝）",
  finished: "終了",
} as const;

export default function AdminTournamentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<TournamentSummary[]>([]);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [venue, setVenue] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "error" } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/tournaments", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "大会一覧を取得できませんでした。");
    setItems(json.tournaments ?? []);
  }, []);

  useEffect(() => {
    load().catch((e) => setToast({ msg: e.message, tone: "error" }));
  }, [load]);

  const run = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const result = await adminPost("/api/admin/tournaments", body);
      await load();
      setToast({ msg: message, tone: "ok" });
      return result;
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "操作できませんでした。", tone: "error" });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const activeId = selectedTournamentId();

  return (
    <AdminShell title="大会一覧" description="大会を登録し、管理対象を切り替えます。">
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-black text-court-800">新しい大会を登録</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className="field" placeholder="大会名" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="field" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            <input className="field" placeholder="会場" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
          <button
            className="btn-primary w-full"
            disabled={busy || !name.trim()}
            onClick={async () => {
              const result = await run({ action: "create", name, event_date: eventDate, venue }, "大会を登録しました");
              const created = result?.tournament as { id?: string } | undefined;
              if (created?.id) {
                selectTournament(created.id);
                setName(""); setEventDate(""); setVenue("");
                router.push("/admin/tournament");
              }
            }}
          >
            大会を登録して設定を開く
          </button>
        </section>

        <div className="space-y-3">
          {items.map((t) => (
            <section key={t.id} className={`card p-4 ${t.archived_at ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-black text-court-900">{t.name}</h2>
                    <span className="chip bg-court-100 text-court-800">
                      {t.archived_at ? "アーカイブ" : PHASE_LABEL[t.phase]}
                    </span>
                    {activeId === t.id && <span className="chip bg-ball-500 text-court-950">管理中</span>}
                  </div>
                  <p className="mt-1 text-sm text-ink-600">{formatDate(t.event_date)} {t.venue}</p>
                </div>
                {!t.archived_at && (
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => { selectTournament(t.id); router.push("/admin"); }}
                  >
                    この大会を管理
                  </button>
                )}
              </div>
              <div className="mt-3 flex justify-end">
                {t.archived_at ? (
                  <button className="btn-ghost btn-sm" disabled={busy} onClick={() => run({ action: "restore", id: t.id }, "大会を復元しました")}>復元</button>
                ) : (
                  <button
                    className="btn-danger btn-sm"
                    disabled={busy}
                    onClick={() => {
                      const confirmation = prompt(`大会をアーカイブします。確認のため「${t.name}」と入力してください。`);
                      if (confirmation === t.name) {
                        run({ action: "archive", id: t.id, confirm: confirmation }, "大会をアーカイブしました").then((result) => {
                          if (result && activeId === t.id) {
                            const next = items.find((item) => item.id !== t.id && !item.archived_at);
                            if (next) selectTournament(next.id);
                          }
                        });
                      }
                    }}
                  >
                    アーカイブ
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
      <Toast message={toast?.msg ?? null} tone={toast?.tone} />
    </AdminShell>
  );
}
