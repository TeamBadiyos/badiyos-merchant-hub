export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight lowercase ${className}`}>
      badiyo<span className="text-primary">s</span>
    </span>
  );
}

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`bg-brand-gradient inline-flex items-center justify-center rounded-2xl font-extrabold text-primary-foreground shadow-brand ${className}`}
    >
      b
    </span>
  );
}