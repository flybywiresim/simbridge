import React from 'react';
import { useModals } from './ModalHook';

export const ModalWrapper: React.FC = () => {
  const { modalShown, currentModal, showModal } = useModals();

  const handleClickBackground = () => showModal(null);

  return (
    <div
      className={`w-screen h-[100dvh] absolute top-0 left-0 z-30 ${
        !modalShown ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      } transition-all duration-200`}
    >
      <div className={`w-full h-full absolute top-0 left-0 bg-navy-dark/95 z-40`} onClick={handleClickBackground}></div>
      <div
        className={`w-full h-full nax-h-full absolute flex flex-col justify-center items-center z-50 pointer-events-none`}
      >
        <div className="w-full max-h-full flex justify-center">{currentModal}</div>
      </div>
    </div>
  );
};
