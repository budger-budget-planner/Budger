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
 * A compact, tappable deck of the three savings buckets.
 * The surrounding Larder panel remains the primary surface; these are the
 * three layered cards inside it, not a second padded panel.
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
      <div className="relative h-[124px] sm:h-[130px]">
        {ordered.slice(2).map(bucket => (
          <div
            key={bucket}
            aria-hidden="true"
            className="absolute inset-x-5 top-4 h-[104px] rounded-[19px] border border-white/[0.08] bg-[#15141a]/90 shadow-[0_10px_24px_rgba(0,0,0,.22)]"
            style={{ transform: "translateY(10px) rotate(-2deg) scale(.96)", opacity: 0.55, zIndex: 1 }}
          >
            <div className="px-4 pt-3.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/30">
                {bucketLabel(bucket)}
              </p>
            </div>
          </div>
        ))}
        <div
          aria-hidden="true"
          className="absolute inset-x-2 top-2 h-[112px] rounded-[20px] border border-white/[0.11] bg-[#111016]/95 shadow-[0_13px_28px_rgba(0,0,0,.28)]"
          style={{ transform: "translateY(7px) rotate(1.2deg) scale(.98)", opacity: 0.82, zIndex: 2 }}
        >
          <div className="px-4 pt-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/38">
              {bucketLabel(ordered[1])}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-white/38">
              {fmtAmt(totalFor(ordered[1]), currency)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={flipToNext}
          aria-label={`${t("larder.flip_stack")}: ${bucketLabel(nextBucket)}`}
          className="absolute inset-x-0 top-0 z-10 h-[118px] rounded-[20px] border border-white/25 bg-[linear-gradient(145deg,#292731,#0d0c12_76%)] px-4 py-3.5 text-left shadow-[0_16px_32px_rgba(0,0,0,.36)] transition duration-300 active:scale-[.985]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
                {t("larder.active_card")}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold text-white/90">
                {bucketLabel(ordered[0])}
              </p>
            </div>
            <span className="mt-0.5 flex items-center gap-1 text-[9px] font-medium text-white/40">
              {t("larder.flip_stack")}
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <p className="mt-3 text-[28px] font-bold tabular-nums text-white">
            {fmtAmt(totalFor(ordered[0]), currency)}
          </p>
        </button>
      </div>
      <div className="mt-0.5 flex items-center justify-center gap-1.5" aria-hidden="true">
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