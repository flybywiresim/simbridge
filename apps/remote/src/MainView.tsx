import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import {
  DataStorageSetCallback,
  RegisterViewListenerCallback,
  RemoteClient,
  SimVarSetCallback,
  SimVarSubscribeCallback,
  ViewListenerOffCallback,
  ViewListenerOnCallback,
} from './RemoteClient';
import { installShims } from './shims';
import { FlightStatusBar } from './FlightStatusBar';
import { InstrumentsPanel } from './InstrumentsPanel';
import { applicationStore, useAppDispatch, useAppSelector } from './store';
import { addAvailableInstrument, clearAvailableInstruments, setLoadedInstrument } from './store/instruments';
import { v4 } from 'uuid';
import { ConnectionPhase, setCurrentSubscriptionGroupID } from './store/connection';
import { clearSimVars } from './store/simVars';
import { CloudSlashFill, Fullscreen, XLg } from 'react-bootstrap-icons';
import { FlightStatusPanel } from './FlightStatusPanel';
import { protocolV0 } from '@flybywiresim/remote-bridge-types';

interface MainViewProps {
  client: RemoteClient;
}

const MainView: React.FC<MainViewProps> = ({ client }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isConnected = useAppSelector((state) => state.connectionState.connected);
  const loadedInstrument = useAppSelector((state) => state.instruments.loadedInstrument);

  const [flightStatusDropdownOpened, setFlightStatusDropdownOpened] = useState(false);
  const [fullScreenOpened, setFullScreenOpened] = useState(false);

  const dispatch = useAppDispatch();

  const simVarSubscribeCallback: SimVarSubscribeCallback = (type, name, unit) => {
    const id = Math.floor(Math.random() * 100_000);

    client.subscribeToSimVar(
      type,
      name,
      unit,
      id,
      applicationStore.getState().connectionState.currentSubscriptionGroupID,
    );

    return id;
  };

  const simVarSetCallback: SimVarSetCallback = (name, unit, value) => {
    return client.setSimVarValue(name, unit, value);
  };

  const dataStorageSetCallback: DataStorageSetCallback = (key, value) => {
    client.setDataStorageKey(key, value);
  };

  const registerViewListenerCallback: RegisterViewListenerCallback = (name) => {
    const listenerID = v4();

    return [listenerID, client.registerViewListener(name, listenerID)];
  };

  const viewListenerOnCallback: ViewListenerOnCallback = (listenerID, event, callback): string => {
    const subscriptionID = v4();

    client.viewListenerOn(
      listenerID,
      event,
      callback,
      subscriptionID,
      applicationStore.getState().connectionState.currentSubscriptionGroupID!,
    );

    return subscriptionID;
  };

  const viewListenerOffCallback: ViewListenerOffCallback = (subscriptionID): void => {
    client.viewListenerOff(subscriptionID);
  };

  const resizeIframe = useCallback(() => {
    if (fullScreenOpened || !iframeRef.current || !iframeRef.current.contentDocument || !loadedInstrument) {
      return;
    }

    const wrapperWidth = iframeRef.current.parentElement!.parentElement!.clientWidth;

    const scale = wrapperWidth / loadedInstrument.dimensions.width;
    iframeRef.current.style.transform = `scale(${scale})`;
    iframeRef.current.style.transformOrigin = 'top left';
  }, [fullScreenOpened, loadedInstrument]);

  const resetIframe = async () => {
    const updateInterval = (window as unknown as { FBW_REMOTE_INTERVAL: number | null }).FBW_REMOTE_INTERVAL;
    if (updateInterval !== null) {
      window.clearInterval(updateInterval);
    }

    if (!iframeRef.current || !iframeRef.current.contentDocument) {
      return;
    }

    const iframeWindow = iframeRef.current.contentWindow!;

    iframeWindow.location.reload();

    // Wait just to be careful
    await new Promise((resolve) => setTimeout(resolve, 100));
  };

  const runCodeInIframe = (code: string, css: string, width: number, height: number) => {
    if (!iframeRef.current || !iframeRef.current.contentDocument) {
      return;
    }

    const iframeWindow = iframeRef.current.contentWindow! as Window & { lastUpdate: number | undefined };
    const iframeDocument = iframeRef.current.contentWindow!.document;

    if (!iframeWindow || !iframeDocument) {
      return;
    }

    iframeRef.current.style.width = `${width}px`;
    iframeRef.current.style.height = `${height}px`;

    (iframeWindow as unknown as { FBW_REMOTE: boolean })['FBW_REMOTE'] = true;

    iframeDocument.head.innerHTML = '';
    iframeDocument.body.innerHTML = '';

    const baseStyleTag = iframeDocument.createElement('style');
    baseStyleTag.textContent = `
    html, body {
      padding: 0;
      margin: 0;
      overflow: hidden;
    }
    `;
    iframeDocument.head.appendChild(baseStyleTag);

    const panelTag = iframeDocument.createElement('vcockpit-panel');
    iframeDocument.body.appendChild(panelTag);

    const instrumentTag = iframeDocument.createElement('a32nx-nd');
    panelTag.appendChild(instrumentTag);

    const contentTag = iframeDocument.createElement('div');
    contentTag.id = 'INSTRUMENT_CONTENT';
    instrumentTag.appendChild(contentTag);

    const titleTag = iframeDocument.createElement('h1');
    titleTag.textContent = '';
    contentTag.appendChild(titleTag);

    const contentTag2 = iframeDocument.createElement('div');
    contentTag2.id = 'MSFS_REACT_MOUNT';
    instrumentTag.appendChild(contentTag2);

    const titleTag2 = iframeDocument.createElement('h1');
    titleTag2.textContent = '';
    contentTag2.appendChild(titleTag2);

    installShims(
      iframeWindow,
      simVarSubscribeCallback,
      simVarSetCallback,
      dataStorageSetCallback,
      registerViewListenerCallback,
      viewListenerOnCallback,
      viewListenerOffCallback,
    );

    const scriptTag = iframeDocument.createElement('script');
    scriptTag.textContent = code;

    iframeDocument.head.appendChild(scriptTag);

    iframeWindow.setInterval(() => {
      const now = Date.now();

      iframeDocument
        ?.getElementById('INSTRUMENT_CONTENT')
        ?.parentElement?.dispatchEvent(new CustomEvent('update', { detail: now - (iframeWindow.lastUpdate ?? now) }));

      iframeWindow.lastUpdate = now;
    });

    const cssTag = iframeDocument.createElement('style');
    cssTag.textContent = css;

    iframeDocument.head.appendChild(cssTag);

    iframeDocument.body.style.backgroundColor = 'black';
  };

  useEffect(() => {
    if (isConnected !== ConnectionPhase.ConnectedToAircraft) {
      return;
    }

    client.enumerateInstruments().then((instruments) => {
      dispatch(clearAvailableInstruments());

      for (const instrument of instruments) {
        dispatch(addAvailableInstrument(instrument));
      }
    });
  }, [client, dispatch, isConnected]);

  useEffect(() => {
    window.addEventListener('resize', resizeIframe);

    return () => window.removeEventListener('resize', resizeIframe);
  }, [resizeIframe]);

  useEffect(() => {
    resizeIframe();
  }, [resizeIframe, loadedInstrument]);

  const handleLoadInstrument = useCallback(
    async (instrument: protocolV0.InstrumentMetadata) => {
      await resetIframe();

      dispatch(clearSimVars());

      const currentSubscriptionGroupID = applicationStore.getState().connectionState.currentSubscriptionGroupID;

      if (currentSubscriptionGroupID !== null) {
        client.cancelSubscriptionGroup(currentSubscriptionGroupID);
      }

      const jsData = await client.downloadFile(instrument.gauges[0].bundles.js);
      const cssData = await client.downloadFile(instrument.gauges[0].bundles.css);

      const jsText = new TextDecoder('utf8').decode(jsData);
      const cssText = new TextDecoder('utf8').decode(cssData);

      dispatch(setLoadedInstrument(instrument));
      dispatch(setCurrentSubscriptionGroupID(v4()));

      runCodeInIframe(jsText, cssText, instrument.dimensions.width, instrument.dimensions.height);
    },
    [client, dispatch, runCodeInIframe],
  );

  useEffect(() => {
    const subscription = client.on('connectionRegained', async () => {
      await resetIframe();

      const currentInstrument = applicationStore.getState().instruments.loadedInstrument;

      if (currentInstrument) {
        await handleLoadInstrument(currentInstrument);
      }
    });

    return () => subscription.cancel();
  }, [client, handleLoadInstrument]);

  return (
    <div className="w-full h-full bg-navy-lighter flex flex-col items-center gap-y-4 pb-4">
      <div
        className={`w-0 h-0 absolute top-0 left-0 z-10 ${
          flightStatusDropdownOpened ? 'opacity-80' : 'opacity-0'
        } transition-all duration-300 ${flightStatusDropdownOpened ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="bg-black w-screen h-screen" onClick={() => setFlightStatusDropdownOpened((old) => !old)} />
      </div>

      <div className="w-0 h-0 top-0 left-0 z-40 absolute">
        <FlightStatusPanel
          shown={flightStatusDropdownOpened}
          onToggleDropdown={() => setFlightStatusDropdownOpened((old) => !old)}
        />
      </div>

      <FlightStatusBar
        dropdownOpen={flightStatusDropdownOpened}
        onToggleDropdown={() => setFlightStatusDropdownOpened((old) => !old)}
      />

      <InstrumentFrame
        ref={iframeRef}
        onFullScreenToggled={() => setFullScreenOpened((old) => !old)}
        handleLoadInstrument={handleLoadInstrument}
      />
      {/*<MessagesPanel />*/}
    </div>
  );
};

const ConnectionLostOverlay: React.FC = () => (
  <div
    className="w-full h-full absolute flex flex-col justify-center items-center gap-y-2.5 pointer-events-none"
    style={{ aspectRatio: '1' }}
  >
    <div className="w-full h-full absolute top-0 left-0 bg-gray-900 opacity-95 z-40"></div>

    <CloudSlashFill size={64} className="text-white z-50" />

    <h1 className="text-3xl font-semibold z-50">Connection Lost</h1>

    <p className="text-xl z-50">
      Instruments can only be used while the simulator is running and connected to the gateway server
    </p>
  </div>
);

export interface NoInstrumentLoadedOverlayProps {
  onInstrumentClicked: (instrument: protocolV0.InstrumentMetadata) => void;
}

const NoInstrumentLoadedOverlay: React.FC<NoInstrumentLoadedOverlayProps> = ({ onInstrumentClicked }) => (
  <div
    className="w-full h-full bg-navy-dark absolute flex flex-col justify-center items-center gap-y-8"
    style={{ aspectRatio: '1' }}
  >
    <InstrumentsPanel onInstrumentClicked={onInstrumentClicked} />
  </div>
);

interface InstrumentFrameProps {
  onFullScreenToggled: () => void;
  handleLoadInstrument: (instrument: protocolV0.InstrumentMetadata) => void;
}

const InstrumentFrame = forwardRef<HTMLIFrameElement, InstrumentFrameProps>(
  ({ onFullScreenToggled, handleLoadInstrument }, ref) => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    const [isFullScreen, setIsFullScreen] = useState(false);

    const connectionState = useAppSelector((state) => state.connectionState.connected);
    const loadedInstrument = useAppSelector((state) => state.instruments.loadedInstrument);

    const instrumentAspectRatio = loadedInstrument
      ? loadedInstrument.dimensions.width / loadedInstrument.dimensions.height
      : 1;

    useEffect(() => {
      const handler = () => {
        const wrapper = wrapperRef.current;

        if (!wrapper) {
          return;
        }

        const wrapperParent = wrapper.parentElement;
        const wrapperParentHeight = wrapperParent!.clientHeight;
        const wrapperHeight = wrapper.clientHeight;
        const marginTop = wrapperParentHeight / 2 - wrapperHeight / 2;

        wrapper.style.marginTop = `${marginTop}px`;
      };

      window.addEventListener('resize', handler);

      return () => window.removeEventListener('resize', handler);
    });

    useEffect(() => {
      const handleElementFullscreen = () => {
        onFullScreenToggled();

        const goingIntoFullScreen = document.fullscreenElement !== null;

        setIsFullScreen(goingIntoFullScreen);

        if (!ref || !('current' in ref) || !ref.current) {
          return;
        }

        if (goingIntoFullScreen) {
          ref.current.style.transform = `scale(${
            1 / Math.max(ref.current.clientWidth / window.innerWidth, ref.current.clientHeight / window.innerHeight)
          })`;
          // ref.current.style.margin = '0 auto';
        } else {
          ref.current.style.transform = '';
          ref.current.style.margin = '';
        }
      };

      const elm = rootRef.current;

      if (!elm) {
        return;
      }

      elm.addEventListener('fullscreenchange', handleElementFullscreen);

      return () => elm.removeEventListener('fullscreenchange', handleElementFullscreen);
    }, [onFullScreenToggled, ref]);

    const handleFullScreen = () => {
      const elm = rootRef.current;

      if (!elm) {
        return;
      }

      elm?.requestFullscreen();
    };

    const connectionLost = connectionState === ConnectionPhase.ConnectedToBridge;

    return (
      <div className="flex-grow max-w-[89%] translate-x-5 relative" style={{ aspectRatio: instrumentAspectRatio }}>
        <div ref={wrapperRef} className={`relative bg-black my-auto`} style={{ aspectRatio: instrumentAspectRatio }}>
          {!loadedInstrument && <NoInstrumentLoadedOverlay onInstrumentClicked={handleLoadInstrument} />}
          <div className="absolute w-0 h-full -left-12">
            <div className="h-full w-12 bg-navy px-3 py-4 flex flex-col items-center rounded-l-md">
              <span className={`text-xl vertical-writing-lr rotate-180 ${!loadedInstrument ? 'opacity-40' : ''}`}>
                -{loadedInstrument?.instrumentID ?? '-----'}
              </span>

              <Fullscreen
                size={20}
                className={`mt-auto hover:text-cyan hover:cursor-pointer ${
                  !loadedInstrument ? 'opacity-40 pointer-events-none' : ''
                }`}
                onClick={handleFullScreen}
              />

              <XLg
                size={24}
                className={`mt-4 hover:text-cyan hover:cursor-pointer ${
                  !loadedInstrument ? 'opacity-40 pointer-events-none' : ''
                }`}
              />
            </div>
          </div>

          <div
            ref={rootRef}
            className={`w-full h-full flex${!isFullScreen ? ' border border-cyan-600 rounded-md' : ''} ${
              connectionLost ? 'pointer-events-none' : ''
            }`}
          >
            <div className="w-0 h-0">
              {loadedInstrument && connectionLost && <ConnectionLostOverlay />}
              <iframe
                ref={ref}
                className={`w-full h-full instrument-frame bg-black overflow-hidden`}
                width={1430}
                height={1000}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

export default MainView;
