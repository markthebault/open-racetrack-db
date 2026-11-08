import type { Layout } from "../schemas/data";

export function traceCredit(layout: Layout) {
  return `Trace ${layout.metadata.attribution} · ${layout.metadata.license}`;
}
