/** Decode two normalized RGBA8 channels, preserving every signed 16-bit value. */
export function decodeTerrainElevation(lowChannel: number, highChannel: number): number {
  const low = Math.round(lowChannel * 255);
  const high = Math.round(highChannel * 255);
  const value = low + high * 256;
  return value >= 32768 ? value - 65536 : value;
}
