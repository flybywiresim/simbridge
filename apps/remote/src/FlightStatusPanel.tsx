import React from 'react';
import { ChevronDown } from 'react-bootstrap-icons';

export interface FlightStatusPanelProps {
  shown: boolean;
  onToggleDropdown: () => void;
}

export const FlightStatusPanel: React.FC<FlightStatusPanelProps> = ({ shown, onToggleDropdown }) => {
  return (
    <div className={` ${shown ? '' : '-translate-y-full'} transition-all duration-300 z-20`}>
      <div className="w-screen pt-8 flex justify-center pointer-events-none">
        <div className="max-w-[390px] flex flex-col gap-y-4 pointer-events-auto">
          <span className="bg-navy p-6 flex items-center justify-between 2xl:justify-start font-manrope font-semibold gap-x-4 rounded-xl">
            <span className="flex flex-col">
              <span className="text-4xl">KLAX</span>
              <span className="text-lg">KLAX</span>
            </span>
            <span className="flex-grow h-1 bg-cyan"></span>
            <span className="flex flex-col">
              <span className="text-4xl">KJFK</span>
              <span className="text-lg">JFK</span>
            </span>
          </span>

          <span className="bg-quasi-white p-6 text-navy-dark text-xl font-mono rounded-xl">
            <span className="text-cyan-medium font-extrabold">KLAX/21R</span> CLEEE PKE DRK J96 SLN J24 MCI J80 SPI
            KOLTS WWODD RINTE KLYNE Q29WWSHR JHW J70 LVZ LENDY8{' '}
            <span className="text-cyan-medium font-extrabold">KJFK/04R</span>
          </span>

          <span className="bg-navy p-6 text-quasi-white text-lg font-mono rounded-xl">
            <div className="w-full flex flex-col items-center mx-auto gap-y-6">
              <div className="w-full flex justify-between">
                <h1 className="text-3xl font-semibold">A320-251N</h1>
                <h1 className="text-3xl">FBW397</h1>
              </div>

              <div className="flex flex-col items-center justify-center divide-y divide-gray-700">
                <div className="h-24 flex items-center divide-x divide-gray-700">
                  <div className="w-28 flex flex-col items-center">
                    <span className="text-3xl font-mono">157</span>
                    <span>HDG</span>
                  </div>
                  <div className="w-40 flex flex-col items-center">
                    <span className="text-3xl font-mono">33 000</span>
                    <span>ALT</span>
                  </div>
                  <div className="w-28 flex flex-col items-center">
                    <span className="text-3xl font-mono">350</span>
                    <span>TAS</span>
                  </div>
                </div>

                <div className="h-24 flex items-center divide-x divide-gray-700">
                  <div className="w-28 flex flex-col items-center">
                    <span className="text-3xl font-mono">157</span>
                    <span>HDG</span>
                  </div>
                  <div className="w-40 flex flex-col items-center">
                    <span className="text-3xl font-mono">LAXJFK1</span>
                    <span>CO RTE</span>
                  </div>
                  <div className="w-28 flex flex-col items-center">
                    <span className="text-3xl font-mono">350</span>
                    <span>TAS</span>
                  </div>
                </div>
              </div>
            </div>
          </span>

          <span
            className={`mx-auto w-20 h-10 bg-navy-lightest hover:bg-navy-lighter self-stretch flex flex-col justify-center items-center transition-colors duration-300 cursor-pointer z-30 rounded-md`}
            onClick={onToggleDropdown}
          >
            <ChevronDown size={22} className={`transition-transform duration-300 ${shown ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </div>
    </div>
  );
};
