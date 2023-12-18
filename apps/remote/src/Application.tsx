import React, { useEffect, useState } from 'react';
import { RemoteClient } from './RemoteClient';
import MainView from './MainView';
import { ModalWrapper } from './modals/ModalWrapper';

let remoteClient: RemoteClient | undefined;
function initializeClient() {
  if (!remoteClient) {
    remoteClient = new RemoteClient(`ws://${window.location.hostname}:8380/interfaces/v1/remote-app`);
  }
}

export const Application: React.FC = () => {
  const [client, setClient] = useState<RemoteClient | null>(null);

  useEffect(() => {
    initializeClient();
    setClient(remoteClient!);
  }, []);

  if (!client) {
    return null;
  }

  return (
    <>
      <ModalWrapper />
      <MainView client={client} />
    </>
  );
};
