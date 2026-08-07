import { createContext, forwardRef, type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  /** Y position of the bucket face's text baseline inside the outer card. */
  previewTop?: number;
  className?: string;
};

type LarderStackMotionContextValue = {
  phase: "idle" | "out" | "in";
  setPhase: (phase: "idle" | "out" | "in") => void;
  setPreview: (preview: ReactNode) => void;
  measurePreviewBounds: (element: HTMLElement | null) => void;
};

const LarderStackMotionContext = createContext<LarderStackMotionContextValue | null>(null);

/**
 * Wraps the complete Larder panel in the three-card stack silhouette.
 * Two matching dark layers sit behind the whole panel, never around the
 * bucket content, so the three total cards read as one physical stack.
 */
export const LarderStackSurface = forwardRef<HTMLDivElement, LarderStackSurfaceProps>(
  function LarderStackSurface({ children, preview, previewTop = 72, className = "" }, ref) {
    const [shufflePhase, setShufflePhase] = useState<"idle" | "out" | "in">("idle");
    const [stablePreview, setStablePreview] = useState(preview);
    const [previewBounds, setPreviewBounds] = useState<{ top: number; height: number } | null>(null);
    const surfaceRef = useRef<HTMLDivElement | null>(null);

    // The parent derives this node from its active bucket. Capture the
    // incoming face at the exact start of a handoff so a parent update cannot
    // replace B with C while B is being revealed.
    const setPreview = (nextPreview: ReactNode) => {
      setStablePreview(nextPreview);
    };

    // The switcher sits below the Larder header and its exact height can
    // change with localized labels and currency breakdowns. Measure it
    // instead of positioning the incoming surface from the outer panel.
    const measurePreviewBounds = (element: HTMLElement | null) => {
      const surface = surfaceRef.current;
      if (!surface || !element) return;
      const surfaceRect = surface.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const nextBounds = {
        top: elementRect.top - surfaceRect.top,
        height: elementRect.height,
      };
      setPreviewBounds(current =>
        current &&
        Math.abs(current.top - nextBounds.top) < 0.5 &&
        Math.abs(current.height - nextBounds.height) < 0.5
          ? current
          : nextBounds,
      );
    };

    useEffect(() => {
      if (shufflePhase === "idle") {
        setStablePreview(preview);
      }
    }, [preview, shufflePhase]);

    const previewRevealClass =
      shufflePhase === "out"
        ? "larder-stack-preview-reveal"
        : shufflePhase === "in"
          ? "larder-stack-preview-visible"
          : "larder-stack-preview-hidden";

    return (
      <LarderStackMotionContext.Provider
        value={{ phase: shufflePhase, setPhase: setShufflePhase, setPreview, measurePreviewBounds }}
      >
      <div
        ref={(node) => {
          surfaceRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
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
        />
        {/* The incoming bucket is an aligned overlay, not content trapped
            behind the outgoing card. It starts fading in with the toss, so
            the whole B surface is visible while A moves away. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 z-20 overflow-hidden rounded-3xl border border-white/20 ${previewRevealClass}`}
          style={{
            top: previewBounds?.top ?? previewTop,
            height: previewBounds?.height ?? 112,
            background: "linear-gradient(145deg, #030305 0%, #0c0b12 18%, #050408 35%, #0f0d18 52%, #040305 68%, #0a0910 82%, #030305 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10)",
          }}
        >
          {stablePreview}
        </div>
        <div
          className={`relative z-10 ${
            shufflePhase === "out"
              ? "larder-stack-shuffle-out"
              : shufflePhase === "in"
                ? "larder-stack-shuffle-in"
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
    <div className={preview ? "absolute inset-0 overflow-hidden rounded-3xl" : ""}>
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

export function SavingsBucketPreview({
  bucket,
  summaries,
  currency,
}: {
  bucket: SavingsBucket;
  summaries: SavingsBucketSummary[];
  currency: string;
}) {
  return (
    <div className="h-full overflow-hidden rounded-3xl px-5">
      <div className="flex items-start justify-between gap-3">
        <SavingsBucketFace
          bucket={bucket}
          summaries={summaries}
          currency={currency}
        />
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
  const [localShufflePhase, setLocalShufflePhase] = useState<"idle" | "out" | "in">("idle");
  const shuffleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shufflePhase = stackMotion?.phase ?? localShufflePhase;
  const setShufflePhase = stackMotion?.setPhase ?? setLocalShufflePhase;
  const setPreview = stackMotion?.setPreview;
  const measurePreviewBounds = stackMotion?.measurePreviewBounds;
  const stackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (shufflePhase === "idle") setVisibleBucket(activeBucket);
  }, [activeBucket, shufflePhase]);

  useEffect(() => () => {
    shuffleTimers.current.forEach(clearTimeout);
  }, []);

  useLayoutEffect(() => {
    const element = stackRef.current;
    if (!element || !measurePreviewBounds) return;

    const measure = () => measurePreviewBounds(element);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measurePreviewBounds]);

  const activeIndex = Math.max(0, BUCKETS.indexOf(visibleBucket));
  const ordered = BUCKETS.map((_, offset) => BUCKETS[(activeIndex + offset) % BUCKETS.length]);
  const nextBucket = ordered[1] ?? nextSavingsBucket(visibleBucket);

  function flipToNext() {
    if (shufflePhase !== "idle") return;

    shuffleTimers.current.forEach(clearTimeout);
    shuffleTimers.current = [];
    // Freeze the exact B face before any state change can cause the parent to
    // derive the following C face.
    setPreview?.(
      <SavingsBucketPreview
        bucket={nextBucket}
        summaries={summaries}
        currency={currency}
      />,
    );
    setShufflePhase("out");

    // Let the incoming surface finish its reveal before the outgoing card
    // finishes fading away. The swap happens only after A is completely gone,
    // so the aligned overlay and the settled B surface are indistinguishable.
    shuffleTimers.current.push(
      setTimeout(() => {
        setVisibleBucket(nextBucket);
        onBucketChange(nextBucket);
        shuffleTimers.current = [];
        setShufflePhase("idle");
      }, 405),
    );
  }

  return (
    <>
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
            opacity: 1;
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
        @keyframes larderStackShuffleIn {
          0% {
            opacity: 0;
            transform: translate3d(0, 5px, 0);
          }
          58% {
            opacity: .72;
            transform: translate3d(0, 1px, 0);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
        .larder-stack-shuffle-in {
          will-change: transform, opacity;
          animation: larderStackShuffleIn 360ms cubic-bezier(.22, 1, .36, 1) both;
        }
        @keyframes larderStackPreviewReveal {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .larder-stack-preview-hidden {
          opacity: 0;
        }
        .larder-stack-preview-reveal {
          opacity: 0;
          will-change: opacity;
          animation: larderStackPreviewReveal 265ms ease-out both;
        }
        .larder-stack-preview-visible {
          opacity: 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .larder-stack-shuffle-out {
            animation: larderStackShuffleOut 1ms linear both;
          }
          .larder-stack-shuffle-in {
            animation: larderStackShuffleIn 1ms linear both;
          }
          .larder-stack-preview-reveal {
            animation: larderStackPreviewReveal 1ms linear both;
          }
        }
      `}</style>
      <div ref={stackRef} className={`relative ${className}`}>
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