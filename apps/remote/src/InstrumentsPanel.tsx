import React from 'react';
import { protocolV0 } from '@flybywiresim/remote-bridge-types';
import { useAppSelector } from './store';
import { ArrowRight } from 'react-bootstrap-icons';
import { useModals } from './modals/ModalHook';
import { ValueModal } from './modals/ValueModal';

export interface InstrumentsPanelProps {
  onInstrumentClicked: (instrument: protocolV0.InstrumentMetadata) => void;
}

export const InstrumentsPanel: React.FC<InstrumentsPanelProps> = ({ onInstrumentClicked }) => {
  const instruments = useAppSelector((state) => state.instruments.availableInstruments);

  const { showValueModal } = useModals();

  const handleSelectInstrument = async () =>
    showValueModal(
      <ValueModal<protocolV0.InstrumentMetadata>
        title="Choose an instrument"
        render={(pickValueAndClose) => (
          <div className="w-full flex-grow grid grid-cols-2 gap-4 overflow-y-auto">
            {instruments.map((it) => (
              <InstrumentButton key={it.instrumentID} instrument={it} onClick={() => pickValueAndClose(it)} />
            ))}
          </div>
        )}
        onValuePicked={(value) => onInstrumentClicked(value)}
      />,
    );

  return (
    <div className="flex justify-center">
      {instruments.length === 0 ? (
        <span className="text-gray-400">No instruments available</span>
      ) : (
        <span>
          <button type="button" className="button button-emphasis pb-9" onClick={handleSelectInstrument}>
            Select instrument
          </button>
        </span>
      )}
    </div>
  );
};

interface InstrumentButtonProps {
  instrument: protocolV0.InstrumentMetadata;
  onClick: () => void;
}

const InstrumentButton: React.FC<InstrumentButtonProps> = ({ instrument, onClick }) => {
  return (
    <button
      className="group w-full h-24 relative flex justify-between items-start px-4 py-5 bg-navy-light hover:bg-transparent border-2 border-transparent hover:border-navy-light transition-colors duration-200 rounded-md"
      onClick={onClick}
    >
      <div className="w-full h-2 absolute left-0 top-0 bg-cyan group-hover:bg-cyan-medium rounded-t-md rounde"></div>

      <h1 className="text-2xl">{instrument.instrumentID}</h1>
      <ArrowRight size={22} className="mt-auto text-cyan translate-x-2 translate-y-2" />
    </button>
  );
};
