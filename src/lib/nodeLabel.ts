import type { MalwareNode } from "../data/types";

/**
 * Node labels and the circle radius that holds them. The layout needs radii
 * (for its no-overlap guarantee) and the canvas needs them (to draw circles and
 * to end edges at the rim), so both read them from here.
 */

const FONT_STACK = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
// mirror `.graph-node text` and `.graph-edge-label` in styles.css
const LABEL_FONT = `580 12px ${FONT_STACK}`;
const RELATION_FONT = `540 11px ${FONT_STACK}`;
export const LABEL_LINE_HEIGHT = 14;
const LABEL_CAP_HEIGHT = 9; // visible glyph height of one 12px line
const LABEL_PAD = 7; // breathing room between the text box and the rim

export const compactName = (node?: MalwareNode) => node?.name.replace(" Stealer", "") ?? "Unknown";

let context: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

function textWidth(text: string, font = LABEL_FONT): number {
  const key = `${font}|${text}`;
  const cached = widths.get(key);
  if (cached !== undefined) return cached;

  if (context === undefined && typeof document !== "undefined") {
    context = document.createElement("canvas").getContext("2d");
  }
  let width: number;
  if (context) {
    context.font = font;
    width = context.measureText(text).width;
  } else {
    // without a canvas, estimate from an average glyph width (~0.6em)
    width = text.length * (font === LABEL_FONT ? 7.2 : 6.6);
  }
  widths.set(key, width);
  return width;
}

/** Rendered width of a relation label ("inspired by"), for collision checks. */
export const relationLabelWidth = (text: string) => textWidth(text, RELATION_FONT);

/** Label lines, the circle that holds them, and the text box's half extents. */
export type NodeLabel = { lines: string[]; radius: number; labelHalfWidth: number; labelHalfHeight: number };

/** One line per word; the radius is the smallest circle around the text box. */
export function nodeLabel(node: MalwareNode, minRadius: number): NodeLabel {
  const lines = compactName(node).split(" ");
  const halfWidth = Math.max(...lines.map((line) => textWidth(line))) / 2;
  const halfHeight = ((lines.length - 1) * LABEL_LINE_HEIGHT + LABEL_CAP_HEIGHT) / 2;
  const radius = Math.max(minRadius, Math.ceil(Math.hypot(halfWidth, halfHeight) + LABEL_PAD));
  return { lines, radius, labelHalfWidth: halfWidth, labelHalfHeight: halfHeight };
}
