import type { ReactNode } from "react";

type MotionPageProps = {
  children: ReactNode;
  routeKey: string;
};

export function MotionPage({ children, routeKey }: MotionPageProps) {
  return (
    <div className="motion-page" data-route-key={routeKey}>
      {children}
    </div>
  );
}
