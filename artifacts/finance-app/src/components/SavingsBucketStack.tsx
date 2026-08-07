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
  className?: string;
};

type LarderStackMotionContextValue = {
  phase: "idle" | "crossfade";
  setPhase: (phase: "idle" | "crossfade") => void;
  transitionBucket: SavingsBucket | null;
  setTransitionBucket: (bucket: SavingsBucket | null) => void;
  incomingSurface: boolean;
};

const LarderStackMotionContext = createContext<LarderStackMotionContextValue | null>(null);

/**
 * Wraps the complete Larder panel in the three-card stack silhouette.
 * The panel itself stays stationary while its bucket content crossfades.
 */
export const LarderStackSurface = forwardRef<HTMLDivElement, LarderStackSurfaceProps>(
  function LarderStackSurface({ children, className = "" }, ref) {
    const [phase, setPhase] = useState<"idle" | "crossfade">("idle");
    const [transitionBucket, setTransitionBucket] = useState<SavingsBucket | null>(null);
    const motion = {
      phase,
      setPhase,
      transitionBucket,
      setTransitionBucket,
      incomingSurface: false,
    };

    return (
      <LarderStackMotionContext.Provider value={motion}>
        <div ref={ref} className={`relative ${className}`}>
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
          />
          <div className="relative z-10 grid">
            <div
              className={`col-start-1 row-start-1 ${
                phase === "crossfade" ? "larder-stack-shuffle-out pointer-events-none" : ""
              }`}
            >
              {children}
            </div>
            {phase === "crossfade" && (
              <LarderStackMotionContext.Provider value={{ ...motion, incomingSurface: true }}>
                <div
                  aria-hidden="true"
                  className="col-start-1 row-start-1 larder-stack-fade-in pointer-events-none"
                >
                  {children}
                </div>
              </LarderStackMotionContext.Provider>
            )}
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

function BucketCardContent({
  bucket,
  summaries,
  currency,
}: {
  bucket: SavingsBucket;
  summaries: SavingsBucketSummary[];
  currency: string;
}) {
  const summary = summaries.find(item => item.bucket === bucket);
  const total = summary?.total ?? 0;
  const breakdown = summary?.currencyBreakdown ?? [];

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
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
        <span className="mt-0.5 flex items-center gap-1 text-[9px] font-medium text-white/40">
          {t("larder.flip_stack")}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
        {BUCKETS.map(item => (
          <span
            key={item}
            className={`h-1.5 rounded-full ${
              item === bucket ? "w-5 bg-white/75" : "w-1.5 bg-white/20"
            }`}
          />
        ))}
      </div>
    </>
  );
}

export function SavingsBucketFace({
  bucket,
  summaries,
  currency,
}: {
  bucket: SavingsBucket;
  summaries: SavingsBucketSummary[];
  currency: string;
}) {
  return <BucketCardContent bucket={bucket} summaries={summaries} currency={currency} />;
}

export function SavingsBucketStack({
  summaries,
  activeBucket,
  onBucketChange,
  currency,
  className = "",
}: SavingsBucketStackProps) {
  const stackMotion = useContext(LarderStackMotionContext);
  const [visibleBucket, setVisibleBucket] = useState<SavingsBucket>(activeBucket);
  const [localTransitionBucket, setLocalTransitionBucket] = useState<SavingsBucket | null>(null);
  const [localPhase, setLocalPhase] = useState<"idle" | "crossfade">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = stackMotion?.phase ?? localPhase;
  const setPhase = stackMotion?.setPhase ?? setLocalPhase;
  const transitionBucket = stackMotion?.transitionBucket ?? localTransitionBucket;
  const setTransitionBucket = stackMotion?.setTransitionBucket ?? setLocalTransitionBucket;
  const bucketForSurface =
    stackMotion?.incomingSurface ? transitionBucket ?? activeBucket : visibleBucket;

  useEffect(() => {
    if (phase === "idle") setVisibleBucket(activeBucket);
  }, [activeBucket, phase]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const nextBucket = nextSavingsBucket(visibleBucket);

  function flipToNext() {
    if (phase !== "idle") return;

    if (timer.current) clearTimeout(timer.current);
    setTransitionBucket(nextBucket);
    setPhase("crossfade");
    timer.current = setTimeout(() => {
      setVisibleBucket(nextBucket);
      setTransitionBucket(null);
      onBucketChange(nextBucket);
      setPhase("idle");
      timer.current = null;
    }, 540);
  }

  const bucketContent = (
    <BucketCardContent bucket={bucketForSurface} summaries={summaries} currency={currency} />
  );

  return (
    <div className={`relative grid ${className}`}>
      <style>{`
        @keyframes larderStackShuffleOut {
          0% {
            opacity: 1;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
          18% {
            opacity: 1;
            transform: translate3d(24px, -1px, 0) rotate(3deg) scale(.99);
          }
          48% {
            opacity: .92;
            transform: translate3d(112px, -7px, 0) rotate(8deg) scale(.97);
          }
          68% {
            opacity: 1;
            transform: translate3d(210px, -4px, 0) rotate(11deg) scale(.95);
          }
          78% {
            opacity: .86;
            transform: translate3d(250px, -1px, 0) rotate(12deg) scale(.94);
          }
          100% {
            opacity: 0;
            transform: translate3d(118%, -4px, 0) rotate(14deg) scale(.9);
          }
        }
        .larder-stack-shuffle-out {
          transform-origin: 50% 50%;
          will-change: transform, opacity;
          animation: larderStackShuffleOut 400ms cubic-bezier(.22, .72, .34, 1) both;
        }
        @keyframes larderStackFadeIn {
          0% { opacity: .16; }
          100% { opacity: 1; }
        }
        .larder-stack-fade-in {
          will-change: opacity;
          animation: larderStackFadeIn 520ms ease-out both;
        }
        @keyframes savingsBucketOutgoing {
          0% { opacity: 1; transform: translate3d(0, 0, 0); }
          72% { opacity: .9; transform: translate3d(72px, -2px, 0); }
          100% { opacity: 0; transform: translate3d(118%, -3px, 0); }
        }
        @keyframes savingsBucketIncoming {
          0% { opacity: .16; }
          100% { opacity: 1; }
        }
        .savings-bucket-outgoing {
          animation: savingsBucketOutgoing 420ms cubic-bezier(.22, .72, .34, 1) both;
        }
        .savings-bucket-incoming {
          animation: savingsBucketIncoming 520ms ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          .larder-stack-shuffle-out,
          .larder-stack-fade-in {
            animation-duration: 1ms;
          }
          .savings-bucket-outgoing,
          .savings-bucket-incoming {
            animation-duration: 1ms;
          }
        }
      `}</style>
      <button
        type="button"
        onClick={flipToNext}
        aria-label={`${t("larder.flip_stack")}: ${bucketLabel(nextBucket)}`}
        className="group relative col-start-1 row-start-1 grid w-full text-left"
      >
        {/* The surrounding Larder surface owns the A toss and B fade. This
            inner state only supplies the correct bucket to each full surface. */}
        {stackMotion ? (
          bucketContent
        ) : (
          <>
            <div
              className={`col-start-1 row-start-1 ${
                transitionBucket ? "savings-bucket-outgoing pointer-events-none" : ""
              }`}
            >
              <BucketCardContent bucket={visibleBucket} summaries={summaries} currency={currency} />
            </div>
            {transitionBucket && (
              <div className="col-start-1 row-start-1 savings-bucket-incoming pointer-events-none">
                <BucketCardContent bucket={transitionBucket} summaries={summaries} currency={currency} />
              </div>
            )}
          </>
        )}
      </button>
    </div>
  );
}