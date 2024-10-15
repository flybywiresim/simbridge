import React, { useRef, useState } from 'react';
import { useAppDispatch } from '../store';
import { ConnectionPhase, updateConnectionState } from '../store/connection';
import { useDebounce } from 'react-use';

import Tail from '../assets/Tail-Alone.svg';

const URL = 'https://gateway.remote.flybywiresim.com/api/v1';

export const AuthenticationPage: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  const dispatch = useAppDispatch();

  const [bridgeIDVerified, setBridgeIDVerified] = useState(false);

  const [typedBridgeID, setTypedBridgeID] = useState('');

  useDebounce(
    () => {
      fetch(`${URL}/get-bridge/${typedBridgeID}`, { method: 'GET' }).then((response) => {
        setBridgeIDVerified(response.ok);
      });
    },
    200,
    [typedBridgeID],
  );

  const handleConnect = () => {
    if (!inputRef.current) {
      return;
    }

    const bridgeName = inputRef.current.value;

    fetch(`${URL}/get-bridge/${bridgeName}`, { method: 'GET' }).then(async (response) => {
      if (!response.ok) {
        return;
      }

      dispatch(updateConnectionState({ bridgeName: bridgeName, connected: ConnectionPhase.ConnectedToBridge }));
    });
  };

  return (
    <div className="w-full h-full bg-navy-dark flex flex-col justify-center items-center gap-y-10">
      <img src={Tail} className="w-28" />

      <div className="flex flex-col justify-center items-center gap-y-2">
        <input
          ref={inputRef}
          type="text"
          className="text-xl bg-navy px-3 py-2 border-2 border-navy-light focus:border-cyan rounded-lg outline-none"
          placeholder="Bridge ID"
          onChange={(event) => setTypedBridgeID(event.target.value)}
        />

        <span>GFNCBENFB4TQ</span>

        <span className={`text-lg ${bridgeIDVerified ? 'text-utility-green' : 'text-quasi-white'}`}>
          {bridgeIDVerified ? 'Bridge ID valid' : 'Checking connection...'}
        </span>
      </div>

      <button className="w-36 button button-emphasis pb-9" disabled={!bridgeIDVerified} onClick={handleConnect}>
        Connect
      </button>
    </div>
  );
};
