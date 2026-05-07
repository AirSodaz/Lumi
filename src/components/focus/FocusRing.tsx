import type { ReactNode } from "react";

type FocusRingProps = {
  children: ReactNode;
  className?: string;
};

export function FocusRing({ children, className = "" }: FocusRingProps) {
  return <span className={`focus-ring ${className}`.trim()}>{children}</span>;
}
