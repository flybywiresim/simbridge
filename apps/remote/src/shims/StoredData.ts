import { applicationStore } from '../store';

export class StoredDataShim {
  constructor(private readonly setStoredDataCallback: (key: string, value: string) => void) {}

  GetStoredData(key: string): unknown {
    return applicationStore.getState().dataStorage.values[key] ?? '';
  }

  SetStoredData(key: string, value: string) {
    this.setStoredDataCallback(key, value);
  }
}
