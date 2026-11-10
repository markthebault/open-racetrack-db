import {
  calculateTraceWidth,
  type WidthCalculationInput,
} from "./trace-width-calculation";
self.onmessage = (event: MessageEvent<WidthCalculationInput>) => {
  try {
    self.postMessage({ ok: true, result: calculateTraceWidth(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
