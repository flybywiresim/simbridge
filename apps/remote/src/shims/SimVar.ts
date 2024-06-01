import { SimVarSetCallback, SimVarSubscribeCallback } from '../RemoteClient';
import { applicationStore } from '../store';
import { storeSimVar } from '../store/simVars';

/**
 * Handles calls to SimVar without msfs-sdk.
 */
export class SimVar {
  constructor(
    private readonly simVarSubscribeCallback: SimVarSubscribeCallback,
    private readonly simVarSetCallback: SimVarSetCallback,
  ) {}

  private defaultValueForUnit(unit: string): any {
    if (unit === 'latlonalt') {
      return { lat: 0, lon: 0, alt: 0 };
    }

    return 0;
  }

  GetRegisteredId(name: string, unit: string): number {
    const id = applicationStore.getState().simVars.namesToIDs[`${name};${unit}`];

    if (!id) {
      const newID = this.simVarSubscribeCallback('simVar', name, unit);

      applicationStore.dispatch(storeSimVar({ name, unit, id: newID }));

      return newID;
    }

    return id;
  }

  GetSimVarValue(name: string, unit: string): any {
    const id = applicationStore.getState().simVars.namesToIDs[`${name};${unit}`];

    if (id === undefined) {
      if (this.simVarSubscribeCallback) {
        const newID = this.simVarSubscribeCallback('simVar', name, unit);

        applicationStore.dispatch(storeSimVar({ name, unit, id: newID }));

        return this.defaultValueForUnit(unit);
      }
    }

    const storedValue = applicationStore.getState().simVars.values[id];

    if (storedValue === undefined) {
      if (this.simVarSubscribeCallback && !applicationStore.getState().simVars.namesToIDs[`${name};${unit}`]) {
        const newID = this.simVarSubscribeCallback('simVar', name, unit);

        applicationStore.dispatch(storeSimVar({ name, unit, id: newID }));

        return this.defaultValueForUnit(unit);
      }
    }

    return storedValue ?? this.defaultValueForUnit(unit);
  }

  GetGlobalVarValue(name: string, unit: string): any {
    const id = applicationStore.getState().simVars.namesToIDs[`${name};${unit}`];

    if (id === undefined) {
      if (this.simVarSubscribeCallback) {
        const newID = this.simVarSubscribeCallback('globalVar', name, unit);

        applicationStore.dispatch(storeSimVar({ name, unit, id: newID }));

        return this.defaultValueForUnit(unit);
      }
    }

    const storedValue = applicationStore.getState().simVars.values[id];

    if (storedValue === undefined) {
      if (this.simVarSubscribeCallback && !applicationStore.getState().simVars.namesToIDs[`${name};${unit}`]) {
        const newID = this.simVarSubscribeCallback('globalVar', name, unit);

        applicationStore.dispatch(storeSimVar({ name, unit, id: newID }));

        return this.defaultValueForUnit(unit);
      }
    }

    return storedValue ?? this.defaultValueForUnit(unit);
  }

  SetSimVarValue(name: string, unit: string, value: string | number): Promise<void> {
    return this.simVarSetCallback(name, unit, value);
  }
}

/**
 Handles calls to SimVar with msfs-sdk.
 */
export class simvar {
  constructor(private readonly simVarSetCallback: SimVarSetCallback) {}

  getValueReg(registeredId: number) {
    return applicationStore.getState().simVars.values[registeredId] ?? 0;
  }

  getValueReg_String(registeredId: number) {
    return this.getValueReg(registeredId);
  }
  getValue_LatLongAlt(registeredId: number) {
    return this.getValueReg(registeredId);
  }
  getValue_LatLongAltPBH(registeredId: number) {
    return this.getValueReg(registeredId);
  }
  getValue_PBH(registeredId: number) {
    return this.getValueReg(registeredId);
  }
  getValue_PID_STRUCT(registeredId: number) {
    return this.getValueReg(registeredId);
  }
  getValue_XYZ(registeredId: number) {
    return this.getValueReg(registeredId);
  }

  setValueReg(registeredId: number, value: any): Promise<void> {
    const nameAndUnit = applicationStore.getState().simVars.idsToNames[registeredId];

    if (!nameAndUnit) {
      console.error(`[shim][simvar](setValueReg) cannot find simvar with id=${registeredId}`);
    }

    const [name, unit] = nameAndUnit.split(';');

    return this.simVarSetCallback(name, unit, value);
  }

  setValueReg_String(registeredId: number, value: any) {
    return this.setValueReg(registeredId, value);
  }
  setValueReg_Bool(registeredId: number, value: any) {
    return this.setValueReg(registeredId, value);
  }
  setValueReg_Number(registeredId: number, value: any) {
    return this.setValueReg(registeredId, value);
  }
  setValue_LatLongAlt(registeredId: number, value: any) {
    return this.setValueReg(registeredId, value);
  }
  setValue_LatLongAltPBH(registeredId: number, value: any) {
    return this.setValueReg(registeredId, value);
  }
  setValue_PBH(registeredId: number, value: any) {
    return this.setValueReg(registeredId, value);
  }
  setValue_PID_STRUCT(registeredId: number, value: any) {
    return this.setValueReg(registeredId, value);
  }
  setValue_XYZ(registeredId: number, value: any) {
    return this.setValueReg(registeredId, value);
  }
}
