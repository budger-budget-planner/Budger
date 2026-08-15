import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ImageOff, Plus, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { UPLOAD_REQUEST_TIMEOUT_MS } from "@/lib/request-timeout";
import { t } from "@/lib/i18n";
import { receiptSrc, compressImage, readImageFile } from "@/lib/imageUtils";
import { ReceiptImg } from "@/components/ReceiptImg";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtAmt, loadPrefs } from "@/lib/prefs";
import {
  getGetRecentActivityQueryKey,
  getListTransactionsQueryKey,
} from "@/lib/api-client";

type Receipt = {
  id: number | null;
  url: string;
};

type ReceiptManagerProps = {
  tx: any;
  open: boolean;
  onClose: () => void;
  isOffline?: boolean;
  title?: string;
};

function receiptList(tx: any): Receipt[] {
  if (Array.isArray(tx?.receipts) && tx.receipts.length > 0) {
    return tx.receipts
      .filter((receipt: any) => typeof receipt?.url === "string" && receipt.url.length > 0)
      .map((receipt: any) => ({
        id: Number.isSafeInteger(receipt.id) ? receipt.id : null,
        url: receipt.url,
      }))
      .slice(0, 3);
  }

  const urls = Array.isArray(tx?.receiptImages) && tx.receiptImages.length > 0
    ? tx.receiptImages
    : tx?.receiptImage
      ? [tx.receiptImage]
      : [];
  return urls
    .filter((url: unknown): url is string => typeof url === "string" && url.length > 0)
    .slice(0, 3)
    .map((url: string) => ({ id: null, url }));
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Image conversion failed");
  const header = dataUrl.slice(0, comma);
  const mime = header.slice(5).split(";")[0] || "image/jpeg";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function fileToUpload(file: File): Promise<{ blob: Blob; name: string }> {
  let dataUrl: string;
  try {
    dataUrl = await compressImage(file, 1400, 0.78);
  } catch {
    // Safari cannot decode HEIC/HEIF for canvas conversion on some iOS versions.
    dataUrl = await readImageFile(file);
  }
  const blob = dataUrlToBlob(dataUrl);
  const extension = blob.type.split("/")[1] || file.name.split(".").pop() || "jpg";
  const name = file.name || `receipt.${extension}`;
  return { blob, name };
}

function updateTransactionCache(queryClient: ReturnType<typeof useQueryClient>, id: number, data: any) {
  const receipts = receiptList(data);
  queryClient.setQueriesData({ queryKey: getListTransactionsQueryKey() }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    return current.map((item: any) => item.id === id
      ? {
        ...item,
        receiptImage: receipts[0]?.url ?? null,
        receiptImages: receipts.map(receipt => receipt.url),
        receipts: data?.receipts ?? receipts.map(receipt => ({ id: receipt.id, url: receipt.url })),
      }
      : item);
  });
  queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
  queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
}

function advanceIndex(index: number, length: number, direction: -1 | 1): number {
  if (length <= 1) return 0;
  return (index + direction + length) % length;
}

export function ReceiptManager({
  tx,
  open,
  onClose,
  isOffline = false,
  title,
}: ReceiptManagerProps) {
  const queryClient = useQueryClient();
  const receiptPickerRef = useRef<HTMLInputElement>(null);
  const pickerActiveRef = useRef(false);
  const processingRef = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadTimedOutRef = useRef(false);
  const uploadCancelledRef = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [localReceipts, setLocalReceipts] = useState<Receipt[] | undefined>();
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open) {
      setLocalReceipts(undefined);
      setLightboxOpen(false);
      setIndex(0);
    }
  }, [open]);

  // Mobile Safari can fire the input event before (or instead of) change when
  // returning from Camera / Photos. Keep the dialog mounted long enough for
  // either event to reach the handler. A short unlock can race with a slow
  // camera hand-off and unmount the picker before the file is read.
  useEffect(() => {
    const onFocus = () => {
      window.setTimeout(() => {
        if (!processingRef.current && !receiptPickerRef.current?.files?.length) {
          pickerActiveRef.current = false;
        }
      }, 5000);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    return () => {
      uploadCancelledRef.current = true;
      uploadAbortRef.current?.abort();
    };
  }, []);

  const receipts = localReceipts ?? receiptList(tx);
  const currentIndex = receipts.length === 0 ? 0 : Math.min(index, receipts.length - 1);
  const currentReceipt = receipts[currentIndex];
  const isBusy = processing;

  function applyResponse(data: any) {
    const next = receiptList(data);
    setLocalReceipts(next);
    setIndex(i => Math.min(i, Math.max(0, next.length - 1)));
    updateTransactionCache(queryClient, tx.id, data);
  }

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    if (processingRef.current) return;
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      // The user cancelled the native picker. It is now safe for the dialog
      // to dismiss normally.
      pickerActiveRef.current = false;
      return;
    }

    const remaining = Math.max(0, 3 - receipts.length);
    if (remaining === 0) {
      pickerActiveRef.current = false;
      toast.error(t("tx.receipt_limit"));
      return;
    }
    const selected = files.slice(0, remaining);
    if (files.length > remaining) toast.error(t("tx.receipt_limit"));

    processingRef.current = true;
    setProcessing(true);
    try {
      const formData = new FormData();
      for (const file of selected) {
        const upload = await fileToUpload(file);
        formData.append("files", upload.blob, upload.name);
      }

      const controller = new AbortController();
      uploadAbortRef.current = controller;
      uploadTimedOutRef.current = false;
      uploadCancelledRef.current = false;
      const timeoutId = window.setTimeout(() => {
        uploadTimedOutRef.current = true;
        controller.abort();
      }, UPLOAD_REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await apiFetch(`${import.meta.env.BASE_URL}api/transactions/${tx.id}/receipts`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
          timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
        });
      } finally {
        window.clearTimeout(timeoutId);
        if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      applyResponse(await response.json());
    } catch (error: any) {
      if (uploadTimedOutRef.current) {
        toast.error("Receipt upload timed out. Please try again.");
      } else if (!uploadCancelledRef.current) {
        toast.error(error?.message ?? t("tx.image_error"));
      }
    } finally {
      processingRef.current = false;
      pickerActiveRef.current = false;
      setProcessing(false);
    }
  }

  async function deleteReceipt(receipt: Receipt, receiptIndex: number) {
    if (isBusy) return;
    setProcessing(true);
    try {
      const endpoint = receipt.id != null
        ? `${import.meta.env.BASE_URL}api/transactions/${tx.id}/receipts/${receipt.id}`
        : `${import.meta.env.BASE_URL}api/transactions/${tx.id}/receipt?index=${receiptIndex}`;
      const response = await apiFetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      applyResponse(await response.json());
    } catch (error: any) {
      toast.error(error?.message ?? t("tx.image_error"));
    } finally {
      setProcessing(false);
    }
  }

  async function deleteAllReceipts() {
    if (isBusy || receipts.length === 0) return;
    setProcessing(true);
    try {
      const response = await apiFetch(`${import.meta.env.BASE_URL}api/transactions/${tx.id}/receipts`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      applyResponse(await response.json());
      setLightboxOpen(false);
    } catch (error: any) {
      toast.error(error?.message ?? t("tx.image_error"));
    } finally {
      setProcessing(false);
    }
  }

  function shift(direction: -1 | 1) {
    setIndex(i => advanceIndex(i, receipts.length, direction));
  }

  function onTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 40) shift(delta < 0 ? 1 : -1);
  }

  const inputProps = {
    type: "file" as const,
    accept: "image/*",
    className: "absolute -z-10 h-px w-px opacity-0",
    tabIndex: -1,
    onChange: handleFiles,
    onInput: (event: React.FormEvent<HTMLInputElement>) => handleFiles(event as unknown as React.ChangeEvent<HTMLInputElement>),
  };

  return (
    <>
      <Dialog
        open={open && !lightboxOpen}
        onOpenChange={value => {
          if (!value && !pickerActiveRef.current && !isBusy) onClose();
        }}
      >
        <DialogContent
          className="max-w-sm"
          onInteractOutside={event => { if (pickerActiveRef.current) event.preventDefault(); }}
          onEscapeKeyDown={event => { if (pickerActiveRef.current || isBusy) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{title ?? t("tx.receipt_label", { desc: tx.description })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {fmtAmt(Number(tx.amount), tx.transactionCurrency ?? loadPrefs().currency)}
              </span>
              {" "}· {tx.categoryName ?? t("common.uncategorized")} · {tx.date}
            </div>

            {currentReceipt ? (
              <div
                className="relative rounded-xl overflow-hidden border border-border bg-muted/30"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                <ReceiptImg
                  src={receiptSrc(currentReceipt.url)!}
                  alt={t("tx.receipt_alt")}
                  className="w-full object-contain cursor-pointer"
                  style={{ maxHeight: 300 }}
                  onClick={() => setLightboxOpen(true)}
                />
                {receipts.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous receipt"
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white"
                      onClick={() => shift(-1)}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next receipt"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white"
                      onClick={() => shift(1)}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-full bg-black/65 p-1.5 text-white hover:bg-destructive disabled:opacity-40"
                  onClick={() => deleteReceipt(currentReceipt, currentIndex)}
                  disabled={isBusy || isOffline}
                  title={t("tx.remove_receipt")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground">
                <ImageOff className="w-8 h-8 opacity-40" />
                <p className="text-sm text-center">{t("tx.no_receipt")}</p>
              </div>
            )}

            {isBusy && (
              <div className="flex justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            )}

            {receipts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  {t("tx.receipt_count", { count: receipts.length })}
                </p>
                {receipts.length > 1 && (
                  <div className="flex justify-center gap-2">
                    {receipts.map((_, receiptIndex) => (
                      <button
                        key={receiptIndex}
                        type="button"
                        aria-label={`Receipt ${receiptIndex + 1}`}
                        onClick={() => setIndex(receiptIndex)}
                        className={`h-2 w-2 rounded-full transition-colors ${receiptIndex === currentIndex ? "bg-foreground" : "bg-muted-foreground/40"}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => {
                  pickerActiveRef.current = true;
                  receiptPickerRef.current?.click();
                }}
                disabled={isOffline || isBusy || receipts.length >= 3}
              >
                <Plus className="w-4 h-4" /> {t("tx.add_receipt_btn")}
              </Button>
            </div>

            {receipts.length > 0 && (
              <Button
                variant="ghost"
                className="w-full gap-2 text-destructive hover:text-destructive"
                onClick={deleteAllReceipts}
                disabled={isOffline || isBusy}
              >
                <Trash2 className="w-4 h-4" /> {t("tx.remove_all_receipts")}
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={onClose} disabled={isBusy}>
              {t("tx.done")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {currentReceipt && lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
          {receipts.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
                onClick={event => { event.stopPropagation(); shift(-1); }}
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white"
                onClick={event => { event.stopPropagation(); shift(1); }}
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}
          <ReceiptImg
            src={receiptSrc(currentReceipt.url)!}
            alt={t("tx.receipt_full_alt")}
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={event => event.stopPropagation()}
          />
        </div>
      )}

      <input ref={receiptPickerRef} {...inputProps} multiple={false} />
    </>
  );
}