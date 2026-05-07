import type { CSSProperties, ReactNode } from "react";

type CinematicHeroProps = {
  actions?: ReactNode;
  backdropUrl?: string | null;
  children?: ReactNode;
  className?: string;
  eyebrow?: string;
  metadata?: ReactNode;
  posterAlt?: string;
  posterUrl?: string | null;
  title: string;
  titleId?: string;
};

export function CinematicHero({
  actions,
  backdropUrl,
  children,
  className = "",
  eyebrow,
  metadata,
  posterAlt = "",
  posterUrl,
  title,
  titleId,
}: CinematicHeroProps) {
  const backdropStyle = backdropUrl
    ? ({ backgroundImage: `url("${backdropUrl}")` } satisfies CSSProperties)
    : undefined;

  return (
    <section
      className={`cinematic-hero ${backdropUrl ? "has-backdrop" : ""} ${className}`.trim()}
    >
      <div className="cinematic-hero-backdrop" style={backdropStyle} />
      <div className="cinematic-hero-shade" />
      <div className="cinematic-hero-content">
        {posterUrl ? (
          <div className="hero-poster" aria-hidden={posterAlt === ""}>
            <img alt={posterAlt} src={posterUrl} />
          </div>
        ) : null}
        <div className="hero-copy">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 id={titleId}>{title}</h1>
          {metadata ? <div className="hero-metadata">{metadata}</div> : null}
          {children ? <div className="hero-description">{children}</div> : null}
          {actions ? <div className="hero-actions">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}
