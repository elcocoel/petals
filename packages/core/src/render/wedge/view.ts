// What part of a flower's world is on screen: its scale, where its origin sits, and the window's size. The
// live flower's camera is one (apps/web/flower/camera.ts); a still picture's fitted view is another.
export interface View {
  k: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
