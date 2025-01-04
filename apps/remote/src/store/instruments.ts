import { protocolV0 } from '@flybywiresim/remote-bridge-types';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface InstrumentsState {
  availableInstruments: protocolV0.InstrumentMetadata[];
  loadedInstrument: protocolV0.InstrumentMetadata | null;
}

const initialState: InstrumentsState = {
  availableInstruments: [
    {
      instrumentID: 'EFB',
      gauges: [],
      dimensions: { width: 0, height: 0 },
    },
    {
      instrumentID: 'PFD',
      gauges: [],
      dimensions: { width: 0, height: 0 },
    },
    {
      instrumentID: 'ND',
      gauges: [],
      dimensions: { width: 0, height: 0 },
    },
    {
      instrumentID: 'EWD',
      gauges: [],
      dimensions: { width: 0, height: 0 },
    },
    {
      instrumentID: 'SD',
      gauges: [],
      dimensions: { width: 0, height: 0 },
    },
  ],
  loadedInstrument: null,
};

export const instrumentsSlice = createSlice({
  name: 'availableInstruments',
  initialState,
  reducers: {
    addAvailableInstrument: (state, action: PayloadAction<protocolV0.InstrumentMetadata>) => {
      state.availableInstruments.push(action.payload);
    },
    clearAvailableInstruments: (state) => {
      state.availableInstruments.length = 0;
    },
    setLoadedInstrument: (state, action: PayloadAction<protocolV0.InstrumentMetadata | null>) => {
      state.loadedInstrument = action.payload;
    },
  },
});

export const { addAvailableInstrument, clearAvailableInstruments, setLoadedInstrument } = instrumentsSlice.actions;

export default instrumentsSlice.reducer;
