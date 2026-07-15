import type { ReactNode } from "react";

export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  inverse = false,
}: {
  index: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  inverse?: boolean;
}) {
  return (
    <div className={`section-heading ${inverse ? "section-heading--inverse" : ""}`}>
      <div className="section-heading__meta"><span>{index}</span>{eyebrow}</div>
      <div className="section-heading__copy">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
