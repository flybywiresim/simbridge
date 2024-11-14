import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SimVarsState {
  idsToNames: Record<number, string>;
  namesToIDs: Record<string, number>;
  values: Record<number, unknown>;
}

const initialState: SimVarsState = {
  idsToNames: {},
  namesToIDs: {},
  values: {},
};

export const availableInstrumentsSlice = createSlice({
  name: 'simVars',
  initialState,
  reducers: {
    storeSimVar: (
      state,
      { payload: { id, name, unit } }: PayloadAction<{ name: string; unit: string; id: number }>,
    ) => {
      state.namesToIDs[`${name};${unit}`] = id;
      state.idsToNames[id] = `${name};${unit}`;
    },
    clearSimVars: () => initialState,
    updateSimVarValue: (state, { payload: { id, value } }: PayloadAction<{ id: number; value: unknown }>) => {
      state.values[id] = value;
    },
  },
});

export const { storeSimVar, clearSimVars, updateSimVarValue } = availableInstrumentsSlice.actions;

export default availableInstrumentsSlice.reducer;
