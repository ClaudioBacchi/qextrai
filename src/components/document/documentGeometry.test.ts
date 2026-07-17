import { describe, expect, it } from 'vitest';
import {
  cssPointToNormalized,
  moveRect,
  normalizedRectToCss,
  rectFromCssPoints,
  resizeRect,
  type NormalizedRect,
} from './documentGeometry';

const page = { width: 200, height: 100 };

describe('documentGeometry', () => {
  it('normalizza un rettangolo disegnato da sinistra a destra', () => {
    expect(rectFromCssPoints({ x: 20, y: 10 }, { x: 120, y: 60 }, page)).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.5,
    });
  });

  it('normalizza un rettangolo disegnato da destra a sinistra', () => {
    expect(rectFromCssPoints({ x: 120, y: 10 }, { x: 20, y: 60 }, page)).toEqual({
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.5,
    });
  });

  it('normalizza un rettangolo disegnato dal basso verso l alto', () => {
    const rect = rectFromCssPoints({ x: 20, y: 80 }, { x: 120, y: 20 }, page);
    expect(rect?.x).toBe(0.1);
    expect(rect?.y).toBe(0.2);
    expect(rect?.width).toBe(0.5);
    expect(rect?.height).toBeCloseTo(0.6);
  });

  it('limita il rettangolo ai bordi pagina', () => {
    expect(rectFromCssPoints({ x: -20, y: -10 }, { x: 240, y: 130 }, page)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it('sposta senza uscire dalla pagina', () => {
    const rect: NormalizedRect = { x: 0.7, y: 0.7, width: 0.25, height: 0.25 };
    expect(moveRect(rect, { x: 0.2, y: 0.2 })).toEqual({
      x: 0.75,
      y: 0.75,
      width: 0.25,
      height: 0.25,
    });
  });

  it('ridimensiona rispettando la dimensione minima', () => {
    const rect: NormalizedRect = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 };
    const resized = resizeRect(rect, 'e', { x: 0.21, y: 0.7 }, page, 20);
    expect(resized.width).toBeCloseTo(0.1);
    expect(resized.x).toBe(0.2);
  });

  it('converte tra coordinate CSS e normalizzate', () => {
    const point = cssPointToNormalized({ x: 50, y: 25 }, page);
    expect(point).toEqual({ x: 0.25, y: 0.25 });
    expect(normalizedRectToCss({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, page)).toEqual({
      x: 50,
      y: 25,
      width: 100,
      height: 50,
    });
  });

  it('mantiene stabili le coordinate tra dimensioni pagina differenti', () => {
    const rect: NormalizedRect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    expect(normalizedRectToCss(rect, { width: 1000, height: 500 })).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });
    expect(normalizedRectToCss(rect, { width: 500, height: 1000 })).toEqual({
      x: 50,
      y: 200,
      width: 150,
      height: 400,
    });
  });
});
