import { FormEvent, useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";

export type ManagedBucket = {
  bucket: string;
  name?: string;
  isDefault?: boolean;
};

type LarderBucketManagerProps = {
  open: boolean;
  scope: "personal" | "great";
  buckets: ManagedBucket[];
  customBucketLimit: number;
  onClose: () => void;
  onChanged: () => void | Promise<unknown>;
};

const DEFAULT_BUCKET_NAMES: Record<string, string> = {
  soft_savings: "Soft Savings",
  hard_savings: "Hard Savings",
  investments: "Investments",
};

function bucketName(bucket: ManagedBucket): string {
  if (bucket.name && (!bucket.isDefault || bucket.name !== DEFAULT_BUCKET_NAMES[bucket.bucket])) return bucket.name;
  const translated = t(`larder.bucket_${bucket.bucket}`);
  return translated === `larder.bucket_${bucket.bucket}` ? (bucket.name ?? bucket.bucket) : translated;
}

export function LarderBucketManager({
  open,
  scope,
  buckets,
  customBucketLimit,
  onClose,
  onChanged,
}: LarderBucketManagerProps) {
  const [newName, setNewName] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const customCount = useMemo(
    () => buckets.filter(bucket => !bucket.isDefault).length,
    [buckets],
  );
  const canCreate = customCount < customBucketLimit;
  const basePath = scope === "personal" ? "larder" : "great-larder";

  if (!open) return null;

  async function readError(response: Response): Promise<never> {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? t("common.error"));
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim() || !canCreate || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`${import.meta.env.BASE_URL}api/${basePath}/buckets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!response.ok) await readError(response);
      setNewName("");
      await onChanged();
    } catch (err: any) {
      setError(err?.message ?? t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!editingKey || !editingName.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(
        `${import.meta.env.BASE_URL}api/${basePath}/buckets/${encodeURIComponent(editingKey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editingName.trim() }),
        },
      );
      if (!response.ok) await readError(response);
      setEditingKey(null);
      setEditingName("");
      await onChanged();
    } catch (err: any) {
      setError(err?.message ?? t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#111] px-5 pb-10 pt-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-white">{t("larder.manage_buckets")}</p>
            <p className="mt-1 text-xs text-white/40">{t("larder.manage_buckets_desc")}</p>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="space-y-2">
          {buckets.map(bucket => (
            <div key={bucket.bucket} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              {editingKey === bucket.bucket ? (
                <form onSubmit={handleRename} className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    autoFocus
                    value={editingName}
                    onChange={event => setEditingName(event.target.value)}
                    maxLength={40}
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!editingName.trim() || loading}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
                  >
                    {t("common.save")}
                  </button>
                </form>
              ) : (
                <>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/80">{bucketName(bucket)}</p>
                  <button
                    type="button"
                    aria-label={`${t("common.edit")} ${bucketName(bucket)}`}
                    onClick={() => {
                      setError("");
                      setEditingKey(bucket.bucket);
                      setEditingName(bucket.name ?? bucketName(bucket));
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/55 transition active:scale-95"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-white/35">
          {t("larder.custom_buckets_remaining", { n: Math.max(0, customBucketLimit - customCount) })}
        </p>

        {canCreate && (
          <form onSubmit={handleCreate} className="mt-4 flex gap-2">
            <input
              value={newName}
              onChange={event => setNewName(event.target.value)}
              maxLength={40}
              placeholder={t("larder.new_bucket_placeholder")}
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
            />
            <button
              type="submit"
              disabled={!newName.trim() || loading}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black transition active:scale-95 disabled:opacity-40"
              aria-label={t("larder.add_bucket")}
            >
              <Plus className="h-5 w-5" />
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      </div>
    </>
  );
}