export function mapMotionOptions(reducedMotion: boolean, duration: number): {
  duration: number;
  essential: boolean;
} {
  return { duration: reducedMotion ? 0 : duration, essential: !reducedMotion };
}
