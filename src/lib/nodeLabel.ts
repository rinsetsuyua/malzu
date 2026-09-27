import type { MalwareNode } from "../data/types";

/**
 * Node marks: a dot whose area is proportional to the family's evidence (the
 * distinct public sources citing it or its relationships), with the name set
 * below it. The layout needs these sizes for its no-overlap guarantee and the
 * canvas needs them to draw, so both read them from here.
 */

const FONT_STACK = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
// mirror `.graph-node text` and `.graph-edge-label` in styles.css
const NAME_FONT = `560 12px ${FONT_STACK}`;
const RELATION_FONT = `540 11px ${FONT_STACK}`;

/** px per √source: 1 source → r 3.4, 8 sources → r 9.6, so area ∝ sources */
const DOT_SCALE = 3.4;
/** gap between a dot's rim and the top of its name */
export const NAME_GAP = 5;
/** height of a name's text box */
export const NAME_HEIGHT = 13;

export const compactName = (node?: MalwareNode) => node?.name.replace(" Stealer", "") ?? "Unknown";

let context: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

function textWidth(text: string, font: string): number {
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
    // without a canvas, estimate from an average glyph width (~0.58em)
    width = text.length * (font === NAME_FONT ? 7 : 6.4);
  }
  widths.set(key, width);
  return width;
}

/** Rendered width of a relation label ("inspired by"), for collision checks. */
export const relationLabelWidth = (text: string) => textWidth(text, RELATION_FONT);

export const dotRadius = (evidence: number) => DOT_SCALE * Math.sqrt(Math.max(1, evidence));

export type NodeMark = { radius: number; labelHalfWidth: number };

export function nodeMark(node: MalwareNode, evidence: number): NodeMark {
  return { radius: dotRadius(evidence), labelHalfWidth: textWidth(compactName(node), NAME_FONT) / 2 };
}
