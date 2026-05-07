import type { HTMLAttributes, ReactNode } from "react";

type GlassPanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function GlassPanel({
  children,
  className = "",
  ...props
}: GlassPanelProps) {
  return (
    <section className={`glass-panel ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
