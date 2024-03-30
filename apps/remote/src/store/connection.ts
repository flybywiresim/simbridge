import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export enum ConnectionPhase {
  NotConnected,
  ConnectedToBridge,
  ConnectedToAircraft,
}

export interface ConnectionState {
  connected: ConnectionPhase;
  clientName: string;
  bridgeName: string | null;
  currentSubscriptionGroupID: string | null;
}

const initialState: ConnectionState = {
  connected: ConnectionPhase.NotConnected,
  bridgeName: null,
  clientName: '',
  currentSubscriptionGroupID: null,
};

export const connectionStateSlice = createSlice({
  name: 'connectionState',
  initialState,
  reducers: {
    updateConnectionState: (
      state,
      {
        payload: { connected, clientName, bridgeName },
      }: PayloadAction<Partial<{ connected: ConnectionPhase; clientName: string; bridgeName: string }>>,
    ) => {
      connected !== undefined && (state.connected = connected);
      clientName !== undefined && (state.clientName = clientName);
      bridgeName !== undefined && (state.bridgeName = bridgeName);
    },
    setCurrentSubscriptionGroupID: (state, action: PayloadAction<string | null>) => {
      state.currentSubscriptionGroupID = action.payload;
    },
  },
});

export const { updateConnectionState, setCurrentSubscriptionGroupID } = connectionStateSlice.actions;

export default connectionStateSlice.reducer;
