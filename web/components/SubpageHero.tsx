import type { ReactNode } from "react";

export function SubpageHero({
  eyebrow,
  title,
  description,
  meta,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  meta: string[];
}) {
  return (
    <section className="subpage-hero">
      <div className="subpage-hero__grid" aria-hidden="true" />
      <div className="shell subpage-hero__inner">
        <div>
          <span className="subpage-hero__eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="subpage-hero__meta">
          {meta.map((item, index) => <span key={item}><b>0{index + 1}</b>{item}</span>)}
        </div>
      </div>
    </section>
  );
}
