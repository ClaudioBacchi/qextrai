export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentRegion = {
  id: string;
  pageNumber: number;
  rect: NormalizedRect;
};

export type CssPoint = {
  x: number;
  y: number;
};

export type CssSize = {
  width: number;
  height: number;
};

export type ResizeHandlePosition =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

export const minRegionSizePx = 6;

export function cssPointToNormalized(point: CssPoint, pageSize: CssSize): CssPoint {
  return {
    x: clamp01(point.x / pageSize.width),
    y: clamp01(point.y / pageSize.height),
  };
}

export function normalizedRectToCss(rect: NormalizedRect, pageSize: CssSize): NormalizedRect {
  return {
    x: rect.x * pageSize.width,
    y: rect.y * pageSize.height,
    width: rect.width * pageSize.width,
    height: rect.height * pageSize.height,
  };
}

export function rectFromCssPoints(
  start: CssPoint,
  end: CssPoint,
  pageSize: CssSize,
  minSizePx = minRegionSizePx,
): NormalizedRect | null {
  const startPoint = cssPointToNormalized(start, pageSize);
  const endPoint = cssPointToNormalized(end, pageSize);
  const x = Math.min(startPoint.x, endPoint.x);
  const y = Math.min(startPoint.y, endPoint.y);
  const width = Math.abs(endPoint.x - startPoint.x);
  const height = Math.abs(endPoint.y - startPoint.y);

  if (width * pageSize.width < minSizePx || height * pageSize.height < minSizePx) {
    return null;
  }

  return clampRect({ x, y, width, height });
}

export function clampRect(rect: NormalizedRect): NormalizedRect {
  const width = clamp01(rect.width);
  const height = clamp01(rect.height);
  const x = clamp(rect.x, 0, 1 - width);
  const y = clamp(rect.y, 0, 1 - height);

  return { x, y, width, height };
}

export function moveRect(rect: NormalizedRect, delta: CssPoint): NormalizedRect {
  return clampRect({
    ...rect,
    x: rect.x + delta.x,
    y: rect.y + delta.y,
  });
}

export function resizeRect(
  rect: NormalizedRect,
  handle: ResizeHandlePosition,
  pointer: CssPoint,
  pageSize: CssSize,
  minSizePx = minRegionSizePx,
): NormalizedRect {
  const minWidth = minSizePx / pageSize.width;
  const minHeight = minSizePx / pageSize.height;
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const x = clamp01(pointer.x);
  const y = clamp01(pointer.y);

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes('w')) nextLeft = Math.min(x, right - minWidth);
  if (handle.includes('e')) nextRight = Math.max(x, left + minWidth);
  if (handle.includes('n')) nextTop = Math.min(y, bottom - minHeight);
  if (handle.includes('s')) nextBottom = Math.max(y, top + minHeight);

  nextLeft = clamp(nextLeft, 0, 1 - minWidth);
  nextTop = clamp(nextTop, 0, 1 - minHeight);
  nextRight = clamp(nextRight, nextLeft + minWidth, 1);
  nextBottom = clamp(nextBottom, nextTop + minHeight, 1);

  return clampRect({
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
  });
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number) {
  return clamp(value, 0, 1);
}
