import React, { PropsWithChildren } from 'react';
import { useModals } from './ModalHook';

export interface SimpleModalProps {
  title: string;
  onClosed?: () => void;
}

export const SimpleModal: React.FC<PropsWithChildren<SimpleModalProps>> = ({
  title,
  onClosed = () => {},
  children,
}) => {
  const { showModal } = useModals();

  const handleClose = () => {
    onClosed();
    showModal(null);
  };

  return (
    <div className="w-[96%] max-w-[480px] max-h-full flex flex-col items-center gap-y-6 bg-navy border-2 border-navy-light p-6 rounded-lg pointer-events-auto">
      <h1 className="text-3xl font-semibold">{title}</h1>

      {children}

      <div className="w-full border-t-2 border-navy-light pt-6">
        <button type="button" className="w-full button button-neutral pb-10" onClick={handleClose}>
          Close
        </button>
      </div>
    </div>
  );
};
