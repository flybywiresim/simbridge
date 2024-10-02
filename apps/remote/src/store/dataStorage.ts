import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DataStorageState {
  values: Record<string, string>;
}

const initialState: DataStorageState = {
  values: {},
};

export const dataStorageSlice = createSlice({
  name: 'dataStorage',
  initialState,
  reducers: {
    clearDataStorage: () => initialState,
    updateDataStorageKey: (state, { payload: { key, value } }: PayloadAction<{ key: string; value: string }>) => {
      state.values[key] = value;
    },
  },
});

export const { clearDataStorage, updateDataStorageKey } = dataStorageSlice.actions;

export default dataStorageSlice.reducer;
