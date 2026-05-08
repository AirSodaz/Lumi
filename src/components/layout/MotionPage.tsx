import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { createRouteMotion } from "../../lib/motion/presets";

type MotionPageProps = {
  children: ReactNode;
  routeKey: string;
};

export function MotionPage({ children, routeKey }: MotionPageProps) {
  const reducedMotion = useReducedMotion();
  const routeMotion = createRouteMotion(reducedMotion);

  return (
    <motion.div
      className="motion-page"
      data-motion-surface="route"
      data-route-key={routeKey}
      {...routeMotion}
    >
      {children}
    </motion.div>
  );
}
