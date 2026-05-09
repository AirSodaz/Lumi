import type { ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion } from "motion/react";
import { createRouteMotion } from "../../lib/motion/presets";

type MotionPageProps = {
  children: ReactNode;
  routeKey: string;
};

export function MotionPage({ children, routeKey }: MotionPageProps) {
  const reducedMotion = useReducedMotion();
  const isPresent = useIsPresent();
  const routeMotion = createRouteMotion(reducedMotion);

  return (
    <motion.div
      aria-hidden={isPresent ? undefined : true}
      className="motion-page"
      data-motion-surface="route"
      data-route-key={routeKey}
      inert={isPresent ? undefined : true}
      style={isPresent ? undefined : { pointerEvents: "none" }}
      {...routeMotion}
    >
      {children}
    </motion.div>
  );
}
