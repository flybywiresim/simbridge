export function uploadTextureData(texture: number[], width: number): number {
  return texture[this.thread.y * width + this.thread.x];
}
