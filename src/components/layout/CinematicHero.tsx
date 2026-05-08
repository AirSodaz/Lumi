import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  createHeroBackdropMotion,
  createSurfaceMotion,
} from "../../lib/motion/presets";

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
  const reducedMotion = useReducedMotion();
  const backdropStyle = backdropUrl
    ? ({ backgroundImage: `url("${backdropUrl}")` } satisfies CSSProperties)
    : undefined;
  const backdropMotion = createHeroBackdropMotion(reducedMotion);

  return (
    <section
      className={`cinematic-hero ${backdropUrl ? "has-backdrop" : ""} ${className}`.trim()}
    >
      <motion.div
        className="cinematic-hero-backdrop"
        data-motion-surface="hero-backdrop"
        style={backdropStyle}
        {...backdropMotion}
      />
      <div className="cinematic-hero-shade" />
      <div className="cinematic-hero-content">
        {posterUrl ? (
          <motion.div
            aria-hidden={posterAlt === ""}
            className="hero-poster"
            data-motion-surface="hero-poster"
            {...createSurfaceMotion(reducedMotion, 1)}
          >
            <img alt={posterAlt} src={posterUrl} />
          </motion.div>
        ) : null}
        <motion.div
          className="hero-copy"
          data-motion-surface="hero-copy"
          {...createSurfaceMotion(reducedMotion, posterUrl ? 2 : 1)}
        >
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 id={titleId}>{title}</h1>
          {metadata ? <div className="hero-metadata">{metadata}</div> : null}
          {children ? <div className="hero-description">{children}</div> : null}
          {actions ? <div className="hero-actions">{actions}</div> : null}
        </motion.div>
      </div>
    </section>
  );
}
