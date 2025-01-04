import { Injectable } from '@nestjs/common';

export type RequestFileFunction = (filePath: string) => Promise<Buffer>;

@Injectable()
export class VfsService {
  public requestFile: RequestFileFunction | null = null;
}
