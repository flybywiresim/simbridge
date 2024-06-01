import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export interface FlightStatusState {
  airframe: {
    name: string;
    livery: string;
  };
}

const initialState: FlightStatusState = {
  airframe: {
    name: '--------',
    livery: '-------',
  },
};

export const flightStatusSlice = createSlice({
  name: 'flightStatus',
  initialState,
  reducers: {
    setFlightState: (state, action: PayloadAction<FlightStatusState>) => {
      state.airframe = action.payload.airframe;
    },
    clearFlightState: () => initialState,
  },
});

export const { setFlightState, clearFlightState } = flightStatusSlice.actions;

export default flightStatusSlice.reducer;
