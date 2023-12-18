import React from 'react';
import { useAppSelector } from './store';
import { ChevronDown, Wifi2, WifiOff } from 'react-bootstrap-icons';
import { ConnectionPhase } from './store/connection';

export interface FlightStatusProps {
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
}

export const FlightStatusBar: React.FC<FlightStatusProps> = ({ dropdownOpen, onToggleDropdown }) => {
  const connectionState = useAppSelector((state) => state.connectionState);

  const flightStatus = useAppSelector((state) => state.flightStatus);

  return (
    <div
      className={`w-full sm:w-[420px] h-12 bg-navy border-2 border-t-0 border-navy-light sm:rounded-b-md text-white mx-auto px-5 flex flex-row items-center gap-x-2.5 transition-all duration-300`}
    >
      <span className="w-48 flex-grow flex flex-row items-center gap-x-2 overflow-hidden">
        <span className="font-manrope">{flightStatus.airframe.name}</span>
        <span className="font-manrope">{flightStatus.airframe.livery}</span>
      </span>

      <span
        className={
          'w-20 bg-navy-lightest hover:bg-navy-lighter self-stretch flex flex-col justify-center items-center transition-colors duration-300 cursor-pointer'
        }
        onClick={onToggleDropdown}
      >
        <ChevronDown size={22} className={`transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`} />
      </span>

      <span
        className={`w-48 flex-grow flex justify-end items-center gap-x-1.5 ${
          connectionState.connected === ConnectionPhase.ConnectedToAircraft
            ? 'text-green-500 animate-pulse'
            : connectionState.connected === ConnectionPhase.ConnectedToBridge
              ? 'text-utility-amber'
              : 'text-white'
        }`}
      >
        {connectionState.connected === ConnectionPhase.ConnectedToAircraft && <Wifi2 size={24} className="mb-1" />}
        {connectionState.connected === ConnectionPhase.ConnectedToBridge && <WifiOff size={24} className="" />}
        {connectionState.connected === ConnectionPhase.ConnectedToAircraft
          ? `Connected (${connectionState.clientName})`
          : connectionState.connected === ConnectionPhase.ConnectedToBridge
            ? 'Waiting on aircraft'
            : 'Not connected'}
      </span>
    </div>
  );
};
