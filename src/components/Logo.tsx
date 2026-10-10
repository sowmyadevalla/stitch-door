export function Logo({ className = '', showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width="32" height="32" viewBox="0 0 48 48" fill="none" className="flex-shrink-0">
        <rect width="48" height="48" rx="10" fill="#244e27" />
        <path d="M14 34L24 14L34 34" stroke="#f5f2e4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="14" r="2" fill="#d4634a" />
        <path d="M24 14L24 34" stroke="#d4634a" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3" />
        <path d="M18 28L30 28" stroke="#f5f2e4" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {showText && (
        <span className="font-serif text-xl font-semibold text-forest-700">
          Stitch<span className="text-terracotta-500">Door</span>
        </span>
      )}
    </div>
  );
}
