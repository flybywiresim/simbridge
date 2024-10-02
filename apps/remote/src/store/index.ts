import { configureStore } from '@reduxjs/toolkit';
import connectionState from './connection';
import flightStatus from './flightState';
import instruments from './instruments';
import messages from './messages';
import simVars from './simVars';
import dataStorage from './dataStorage';

import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

export const applicationStore = configureStore({
  reducer: { connectionState, flightStatus, instruments, messages, simVars, dataStorage },
});

export type AppState = ReturnType<typeof applicationStore.getState>;
export type AppDispatch = typeof applicationStore.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector;
