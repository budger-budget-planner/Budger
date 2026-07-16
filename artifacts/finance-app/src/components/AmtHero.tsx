import { currencySymbol } from "@/lib/prefs";

interface AmtHeroProps {
  amount: number;
  currency: string;
  className?: string;
}

/**
 * Renders a hero monetary amount with the decimal portion at half the
 * font size of the integer part, improving visual hierarchy on large figures.
 * Wrap in a <p> or block element with the desired text-size class.
 */
export function AmtHero({ amount, currency, className }: AmtHeroProps) {
  const sym   = currencySymbol(currency);
  const fixed = amount.toFixed(2);        // e.g. "8381.27"
  const dot   = fixed.indexOf(".");
  const whole = fixed.slice(0, dot);      // "8381"
  const frac  = fixed.slice(dot);         // ".27"

  if (currency === "PLN") {
    return (
      <span className={className}>
        {whole}<span className="text-[0.7em]">{frac}</span>{sym}
      </span>
    );
  }
  return (
    <span className={className}>
      {sym}{whole}<span className="text-[0.7em]">{frac}</span>
    </span>
  );
}
