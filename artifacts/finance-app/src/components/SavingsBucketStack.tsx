import { ArrowRight } from "lucide-react";
import { t } from "@/lib/i18n";
import { fmtAmt } from "@/lib/prefs";

export type SavingsBucket = "soft_savings" | "hard_savings" | "investments";

export type SavingsBucketSummary = {
  bucket: SavingsBucket;
  total: number;
};

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
 * The surrounding Larder panel is the active card in the stack; the two
 * offset outlines behind it make the three physical layers legible without
 * introducing another content card inside the panel.
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
    <div className={`relative min-h-[140px] ${className}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-5 h-[112px] rounded-[18px] border border-white/[0.09] bg-white/[0.012]"
        style={{ transform: "translateY(11px) rotate(1.6deg)", zIndex: 1 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 top-3 h-[116px] rounded-[19px] border border-white/[0.13] bg-white/[0.018]"
        style={{ transform: "translateY(6px) rotate(-1deg)", zIndex: 2 }}
      />
      <button
        type="button"
        onClick={flipToNext}
        aria-label={`${t("larder.flip_stack")}: ${bucketLabel(nextBucket)}`}
        className="group relative z-10 w-full text-left transition duration-300 active:scale-[.99]"
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
      <div className="relative z-10 mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
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