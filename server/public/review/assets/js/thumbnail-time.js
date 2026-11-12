export const CELL_US = 5000000n;
export const CELL_PX = 128;
export const ROW_PX = 68;
export function secondsUs(seconds) {
  if (!Number.isFinite(seconds)) return 0n;
  const [whole, fraction = ""] = seconds.toFixed(6).split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}
export function usSeconds(us) {
  return Number(us / 1000000n) + Number(us % 1000000n) / 1000000;
}
export function cellStart(us) { return us - ((us % CELL_US) + CELL_US) % CELL_US; }
export function timeX(us, origin, pxPerSecond = 25.6) {
  return Number(us - origin) / 1000000 * pxPerSecond;
}
export function xTime(x, origin, pxPerSecond = 25.6) {
  return origin + BigInt(Math.round(x / pxPerSecond * 1000000));
}
export function clampScroll(value, width, viewport) { return Math.max(0, Math.min(Math.max(0, width - viewport), value)); }
export function visibleCells(scroll, viewport, count, margin = 2, maximum = 32) {
  const first = Math.max(0, Math.floor(scroll / CELL_PX) - margin);
  const end = Math.min(count, first + maximum, Math.ceil((scroll + viewport) / CELL_PX) + margin);
  return {first, end};
}
export function anchorTime(scroll, viewport, offset, origin, scale) { return xTime(scroll + viewport / 2 - offset, origin, scale); }
export function scrollForTime(time, origin, scale, offset, anchor, width, viewport) {
  return clampScroll(timeX(time, origin, scale) + offset - anchor, width, viewport);
}
