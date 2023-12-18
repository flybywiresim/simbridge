import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface LogMessage {
  direction: 'up' | 'down';
  contents: string;
}

export type MessagesState = LogMessage[];

const initialState: MessagesState = [];

export const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    appendMessage: (state, action: PayloadAction<LogMessage>) => {
      state.push(action.payload);
    },
  },
});

export const { appendMessage } = messagesSlice.actions;

export default messagesSlice.reducer;
