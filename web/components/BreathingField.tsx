export function BreathingField() {
  return (
    <div className="breathing-field" aria-hidden="true">
      <div className="breathing-field__axis" />
      <div className="breathing-field__ring breathing-field__ring--one" />
      <div className="breathing-field__ring breathing-field__ring--two" />
      <div className="breathing-field__ring breathing-field__ring--three" />
      <div className="breathing-field__pulse" />
    </div>
  );
}
