import React, { PropsWithChildren, useCallback, useState } from 'react';

export interface ModalContextType {
  modalShown: boolean;
  currentModal: React.ReactElement | null;
  showModal: (modal: React.ReactElement | null) => void;
  showValueModal: (modal: React.ReactElement | null) => Promise<void>;
  closeModal: () => void;
}

export const ModalContext = React.createContext<ModalContextType>(undefined as any);

export const ModalContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [modalShown, setModalShown] = useState(false);
  const [currentModal, setCurrentModal] = useState<React.ReactElement | null>(null);
  const [currentModalPromiseResolveFn, setCurrentModalPromiseResolveFn] = useState<(() => void) | null>(null);

  const showModal = useCallback(
    (modal: React.ReactElement | null) => {
      const nowShowingModal = !modalShown && modal !== null;

      if (nowShowingModal) {
        setCurrentModal(modal);
        setModalShown(true);
      } else {
        setModalShown(false);

        setTimeout(() => setCurrentModal(null), 300);
      }
    },
    [modalShown],
  );

  const showValueModal = useCallback(
    (modal: React.ReactElement | null): Promise<void> => {
      return new Promise((resolve) => {
        const nowShowingModal = !modalShown && modal !== null;

        if (nowShowingModal) {
          setCurrentModal(React.cloneElement(modal));
          setCurrentModalPromiseResolveFn(resolve);
          setModalShown(true);
        } else {
          setModalShown(false);

          currentModalPromiseResolveFn?.();

          setTimeout(() => setCurrentModal(null), 300);
        }
      });
    },
    [currentModalPromiseResolveFn, modalShown],
  );

  const closeModal = () => {
    if (!modalShown) {
      return;
    }

    setModalShown(false);

    setTimeout(() => setCurrentModal(null), 300);
  };

  return (
    <ModalContext.Provider value={{ modalShown, currentModal, showModal, showValueModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
};
