export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-lockup" aria-label="序感科技 SenseOrder">
      <span className="brand-symbol" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && (
        <span className="brand-wordmark">
          <strong>序感科技</strong>
          <small>SENSEORDER</small>
        </span>
      )}
    </span>
  );
}
