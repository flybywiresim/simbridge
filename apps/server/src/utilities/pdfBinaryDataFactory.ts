import { readFile } from 'fs/promises';

type ResourceKind = 'cMapUrl' | 'standardFontDataUrl' | 'wasmUrl';

export class NodeBinaryDataFactory {
  constructor(private readonly urls: Partial<Record<ResourceKind, string>>) {}

  async fetch({ kind, filename }: { kind: ResourceKind; filename: string }): Promise<Uint8Array> {
    const baseUrl = this.urls[kind];
    if (!baseUrl) {
      throw new Error(`Missing PDF.js resource location: ${kind}`);
    }

    const resourcePath = `${baseUrl}${filename}`;
    // WASM fallback imports need file URLs; Node's readFile needs a URL object to read them.
    const data = await readFile(resourcePath.startsWith('file:') ? new URL(resourcePath) : resourcePath);
    return new Uint8Array(data);
  }
}
