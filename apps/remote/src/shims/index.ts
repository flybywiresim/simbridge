import * as CoherentShim from './Coherent';
import * as SimVarShim from './SimVar';
import * as MsfsSdk from './MsfsSdk';
import * as DataStorage from './StoredData';
import {
  SimVarSubscribeCallback,
  DataStorageSetCallback,
  SimVarSetCallback,
  RegisterViewListenerCallback,
  ViewListenerOnCallback,
  ViewListenerOffCallback,
} from '../RemoteClient';

export function installShims(
  window: Window,
  simVarSubscribeCallback: SimVarSubscribeCallback,
  simVarSetCallback: SimVarSetCallback,
  dataStorageSetCallback: DataStorageSetCallback,
  registerViewListenerCallback: RegisterViewListenerCallback,
  viewListenerOnCallback: ViewListenerOnCallback,
  viewListenerOffCallback: ViewListenerOffCallback,
): void {
  const simvar = new SimVarShim.simvar(simVarSetCallback);
  const dataStorage = new DataStorage.StoredDataShim(dataStorageSetCallback);

  const RegisterViewListener = CoherentShim.RegisterViewListenerFactory(
    registerViewListenerCallback,
    viewListenerOnCallback,
    viewListenerOffCallback,
  );

  const shim = {
    Coherent: new CoherentShim.Coherent(simvar),
    RegisterViewListener,
    SimVar: new SimVarShim.SimVar(simVarSubscribeCallback, simVarSetCallback),
    simvar,
    Avionics: {
      Utils: {
        DEG2RAD: Math.PI / 180,
      },
    },
    LatLongAlt: class {
      constructor(
        private readonly lat: number,
        private readonly long: number,
        private readonly alt: number,
      ) {}
    },
    RunwayDesignator: MsfsSdk.RunwayDesignator,
    GameState: MsfsSdk.GameState,
    BaseInstrument: MsfsSdk.BaseInstrument,
    registerInstrument: MsfsSdk.registerInstrument,
    LaunchFlowEvent: MsfsSdk.LaunchFlowEvent,
    RegisterGenericDataListener: () => {
      return {};
    },
    GetStoredData: dataStorage.GetStoredData.bind(dataStorage),
    SetStoredData: dataStorage.SetStoredData.bind(dataStorage),
  };

  Object.assign(window, shim);
}
