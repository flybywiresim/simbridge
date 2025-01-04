import React, { PropsWithChildren, useState } from 'react';
import { SimpleModal, SimpleModalProps } from './SimpleModal';
import { useModals } from './ModalHook';

export interface ValueModalProps<T> extends SimpleModalProps {
  render: ValueModalRenderFn<T>;
  onValuePicked?: (value: T) => void;
}

type ValueModalRenderFn<T> = (
  pickValueAndClose: (value: T) => void,
  pickValue: (value: T) => void,
) => React.ReactElement;

export const ValueModal = <T,>({
  title,
  render = () => <></>,
  onValuePicked = () => {},
}: PropsWithChildren<ValueModalProps<T>>): React.ReactElement => {
  const { closeModal } = useModals();

  const [pickedValue, setPickedValue] = useState<T | null>(null);

  const handleClosed = () => {
    if (pickedValue !== null) {
      onValuePicked(pickedValue);
    }
  };

  const handlePickValueAndClose = (value: T) => {
    if (value !== null) {
      onValuePicked(value);
    }
    closeModal();
  };

  const handlePickValue = (value: T) => {
    if (value !== null) {
      setPickedValue(value);
    }
  };

  return (
    <SimpleModal title={title} onClosed={handleClosed}>
      {render(handlePickValueAndClose, handlePickValue)}
    </SimpleModal>
  );
};
