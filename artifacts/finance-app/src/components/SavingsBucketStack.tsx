import { forwardRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { t } from "@/lib/i18n";
import { fmtAmt } from "@/lib/prefs";

export type SavingsBucket = "soft_savings" | "hard_savings" | "investments";

export type SavingsBucketSummary = {
  bucket: SavingsBucket;
  total: number;
};

type LarderStackSurfaceProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Wraps the complete Larder panel in the three-card stack silhouette.
 * The colored layers sit behind the whole panel, never around the bucket
 * content, so they read as the physical stack rather than nested cards.
 */
export const LarderStackSurface = forwardRef<HTMLDivElement, LarderStackSurfaceProps>(
  function LarderStackSurface({ children, className = "" }, ref) {
    return (
      <div ref={ref} className={`relative ${className}`}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-4 right-[-8px] top-[-30px] rounded-3xl border-2 border-[#f2c94c] bg-[#f2c94c] shadow-[0_8px_18px_rgba(0,0,0,.18)]"
          style={{ zIndex: 1 }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-2 right-[-4px] top-[-18px] rounded-3xl border-2 border-[#ff9f1c] bg-[#ff9f1c] shadow-[0_8px_18px_rgba(0,0,0,.2)]"
          style={{ zIndex: 2 }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1 right-[-1px] top-[-8px] rounded-3xl border-2 border-[#ef4b3e] bg-[#ef4b3e] shadow-[0_8px_18px_rgba(0,0,0,.22)]"
          style={{ zIndex: 3 }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    );
  },
);

type SavingsBucketStackProps = {
  summaries: SavingsBucketSummary[];
  activeBucket: SavingsBucket;
  onBucketChange: (bucket: SavingsBucket) => void;
  currency: string;
  className?: string;
};

const BUCKETS: SavingsBucket[] = ["soft_savings", "hard_savings", "investments"];

function bucketLabel(bucket: SavingsBucket): string {
  return t(`larder.bucket_${bucket}`);
}

/**
 * A bucket switcher that lives directly on the Larder surface.
 * The surrounding Larder panel is the card in the stack; this component
 * deliberately does not create another visible card inside it.
 */
export function SavingsBucketStack({
  summaries,
  activeBucket,
  onBucketChange,
  currency,
  className = "",
}: SavingsBucketStackProps) {
  const activeIndex = Math.max(0, BUCKETS.indexOf(activeBucket));
  const ordered = BUCKETS.map((_, offset) => BUCKETS[(activeIndex + offset) % BUCKETS.length]);
  const nextBucket = ordered[1];

  const totalFor = (bucket: SavingsBucket) =>
    summaries.find(summary => summary.bucket === bucket)?.total ?? 0;

  function flipToNext() {
    onBucketChange(nextBucket);
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={flipToNext}
        aria-label={`${t("larder.flip_stack")}: ${bucketLabel(nextBucket)}`}
        className="group w-full text-left transition duration-300 active:scale-[.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
              {bucketLabel(ordered[0])}
            </p>
            <p className="mt-2 text-[28px] font-bold tabular-nums text-white">
              {fmtAmt(totalFor(ordered[0]), currency)}
            </p>
          </div>
          <span className="mt-0.5 flex items-center gap-1 text-[9px] font-medium text-white/40 transition-colors group-hover:text-white/70">
            {t("larder.flip_stack")}
            <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </button>
      <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
        {BUCKETS.map(bucket => (
          <span
            key={bucket}
            className={`h-1.5 rounded-full transition-all ${
              bucket === activeBucket ? "w-5 bg-white/75" : "w-1.5 bg-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}