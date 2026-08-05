import { ReactNode } from "react";

interface RenderProps {
  if?: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

export function Render({ if: when, children, fallback = <></> }: RenderProps) {
  if (!when) {
    return fallback;
  }
  return children;
}
