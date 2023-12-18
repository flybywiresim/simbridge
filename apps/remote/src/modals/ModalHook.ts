import { useContext } from 'react';
import { ModalContext } from './ModalContext';

export const useModals = () => useContext(ModalContext);
