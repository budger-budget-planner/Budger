import { ArrowRight, Layers3 } from "lucide-react";
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
 * The front card is the active source of funds for the actions below it.
 * Tapping the front card or the flip control advances through the deck.
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
      <div className="relative h-[142px] sm:h-[148px]">
        {ordered.slice(2).map(bucket => (
          <div
            key={bucket}
            aria-hidden="true"
            className="absolute inset-x-4 top-5 h-[116px] rounded-[26px] border border-white/10 bg-[#17151d]/90 shadow-xl"
            style={{ transform: "translateY(9px) scale(.94)", opacity: 0.62, zIndex: 1 }}
          >
            <div className="px-4 pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                {bucketLabel(bucket)}
              </p>
            </div>
          </div>
        ))}
        <div
          aria-hidden="true"
          className="absolute inset-x-2 top-2 h-[124px] rounded-[26px] border border-white/10 bg-[#121018]/95 shadow-xl"
          style={{ transform: "translateY(7px) scale(.97)", opacity: 0.86, zIndex: 2 }}
        >
          <div className="px-4 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">
              {bucketLabel(ordered[1])}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-white/45">
              {fmtAmt(totalFor(ordered[1]), currency)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={flipToNext}
          aria-label={`${t("larder.flip_stack")}: ${bucketLabel(nextBucket)}`}
          className="absolute inset-x-0 top-0 z-10 h-[132px] rounded-[26px] border border-white/25 bg-[linear-gradient(145deg,#25232e,#0b0a10_72%)] px-5 py-4 text-left shadow-[0_18px_40px_rgba(0,0,0,.42)] transition duration-300 active:scale-[.985]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Layers3 className="h-4 w-4 text-white/55" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                  {t("larder.active_card")}
                </p>
                <p className="mt-0.5 text-base font-semibold text-white/90">
                  {bucketLabel(ordered[0])}
                </p>
              </div>
            </div>
            <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-white/40">
              {t("larder.flip_stack")}
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
          <p className="mt-4 text-3xl font-bold tabular-nums text-white">
            {fmtAmt(totalFor(ordered[0]), currency)}
          </p>
        </button>
      </div>
      <div className="mt-1 flex items-center justify-center gap-1.5" aria-hidden="true">
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