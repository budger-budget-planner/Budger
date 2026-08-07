import { createContext, forwardRef, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { t } from "@/lib/i18n";
import { fmtAmt } from "@/lib/prefs";
import { AmtHero } from "@/components/AmtHero";

export type SavingsBucket = "soft_savings" | "hard_savings" | "investments";

export type SavingsBucketSummary = {
  bucket: SavingsBucket;
  total: number;
  currencyBreakdown?: { currency: string; rawTotal: number }[];
};

type LarderStackSurfaceProps = {
  children: ReactNode;
  preview?: ReactNode;
  className?: string;
};

type LarderStackMotionContextValue = {
  phase: "idle" | "out";
  setPhase: (phase: "idle" | "out") => void;
};

const LarderStackMotionContext = createContext<LarderStackMotionContextValue | null>(null);

/**
 * Wraps the complete Larder panel in the three-card stack silhouette.
 * Two matching dark layers sit behind the whole panel, never around the
 * bucket content, so the three total cards read as one physical stack.
 */
export const LarderStackSurface = forwardRef<HTMLDivElement, LarderStackSurfaceProps>(
  function LarderStackSurface({ children, preview, className = "" }, ref) {
  const [shufflePhase, setShufflePhase] = useState<"idle" | "out">("idle");

    return (
      <LarderStackMotionContext.Provider value={{ phase: shufflePhase, setPhase: setShufflePhase }}>
      <div
        ref={ref}
        className={`relative ${className}`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 right-[-5px] top-[-14px] rounded-3xl"
          style={{
            zIndex: 1,
            background: "linear-gradient(145deg, #030305 0%, #0c0b12 18%, #050408 35%, #0f0d18 52%, #040305 68%, #0a0910 82%, #030305 100%)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 0 40px 6px rgba(255,255,255,0.025), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1 right-[-2px] top-[-7px] rounded-3xl"
          style={{
            zIndex: 2,
            background: "linear-gradient(145deg, #030305 0%, #0c0b12 18%, #050408 35%, #0f0d18 52%, #040305 68%, #0a0910 82%, #030305 100%)",
            border: "1px solid rgba(255,255,255,0.20)",
            boxShadow: "0 0 48px 8px rgba(255,255,255,0.035), inset 0 1px 0 rgba(255,255,255,0.10)",
          }}
        >
          {preview}
        </div>
        <div
          className={`relative z-10 ${
            shufflePhase === "out"
              ? "larder-stack-shuffle-out"
              : ""
          }`}
        >
          {children}
        </div>
      </div>
      </LarderStackMotionContext.Provider>
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

export function nextSavingsBucket(bucket: SavingsBucket): SavingsBucket {
  return BUCKETS[(BUCKETS.indexOf(bucket) + 1) % BUCKETS.length];
}

type SavingsBucketFaceProps = {
  bucket: SavingsBucket;
  summaries: SavingsBucketSummary[];
  currency: string;
  preview?: boolean;
};

export function SavingsBucketFace({
  bucket,
  summaries,
  currency,
  preview = false,
}: SavingsBucketFaceProps) {
  const summary = summaries.find(item => item.bucket === bucket);
  const total = summary?.total ?? 0;
  const breakdown = summary?.currencyBreakdown ?? [];

  return (
    <div className={preview ? "absolute inset-0 overflow-hidden rounded-3xl px-5 pt-5" : ""}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {bucketLabel(bucket)}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-white">
        <AmtHero amount={total} currency={currency} />
      </p>
      {breakdown
        .filter(asset => Math.abs(asset.rawTotal) >= 0.005)
        .map(asset => (
          <p key={asset.currency} className="mt-1 text-xs tabular-nums text-white/45">
            {fmtAmt(asset.rawTotal, asset.currency)}
          </p>
        ))}
    </div>
  );
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
  const stackMotion = useContext(LarderStackMotionContext);
  const [visibleBucket, setVisibleBucket] = useState<SavingsBucket>(activeBucket);
  const [localShufflePhase, setLocalShufflePhase] = useState<"idle" | "out">("idle");
  const shuffleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shufflePhase = stackMotion?.phase ?? localShufflePhase;
  const setShufflePhase = stackMotion?.setPhase ?? setLocalShufflePhase;

  useEffect(() => {
    if (shufflePhase === "idle") setVisibleBucket(activeBucket);
  }, [activeBucket, shufflePhase]);

  useEffect(() => () => {
    shuffleTimers.current.forEach(clearTimeout);
  }, []);

  const activeIndex = Math.max(0, BUCKETS.indexOf(visibleBucket));
  const ordered = BUCKETS.map((_, offset) => BUCKETS[(activeIndex + offset) % BUCKETS.length]);
  const nextBucket = ordered[1] ?? nextSavingsBucket(visibleBucket);

  function flipToNext() {
    if (shufflePhase !== "idle") return;

    shuffleTimers.current.forEach(clearTimeout);
    shuffleTimers.current = [];
    setShufflePhase("out");

    shuffleTimers.current.push(setTimeout(() => {
      setVisibleBucket(nextBucket);
      onBucketChange(nextBucket);
      setShufflePhase("idle");
    }, 300));

    shuffleTimers.current.push(setTimeout(() => {
      shuffleTimers.current = [];
    }, 320));
  }

  return (
    <>
      <style>{`
        @keyframes larderStackShuffleOut {
          0% { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
           32% { opacity: .88; transform: translate3d(18px, 8px, 0) rotate(3deg) scale(.98); }
           70% { opacity: .38; transform: translate3d(-22px, 26px, 0) rotate(-4deg) scale(.95); }
           100% { opacity: 0; transform: translate3d(-34px, 38px, 0) rotate(-6deg) scale(.91); }
        }
        .larder-stack-shuffle-out {
           transform-origin: 50% 50%;
          will-change: transform, opacity;
           animation: larderStackShuffleOut 280ms cubic-bezier(.4, 0, .7, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
           .larder-stack-shuffle-out {
            animation: none;
          }
        }
      `}</style>
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={flipToNext}
          aria-label={`${t("larder.flip_stack")}: ${bucketLabel(nextBucket)}`}
          className="group w-full text-left transition duration-300 active:scale-[.99]"
        >
           <div className="flex items-start justify-between gap-3">
            <div>
               <SavingsBucketFace
                 bucket={visibleBucket}
                 summaries={summaries}
                 currency={currency}
               />
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
                bucket === visibleBucket ? "w-5 bg-white/75" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
}