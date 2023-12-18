import { simvar } from './SimVar';
import { RegisterViewListenerCallback, ViewListenerOnCallback } from '../RemoteClient';

export class Coherent {
  constructor(private readonly simvar: simvar) {}

  trigger(name: string, ...data: unknown[]) {
    console.log('Coherent.trigger', name, data);
    return null;
  }

  on(name: string, callback: (...data: unknown[]) => void): { clear: () => void } {
    console.log('Coherent.on', name, callback);
    return { clear: () => null };
  }

  call(name: string, ...args: any[]): Promise<unknown> {
    console.log('Coherent.call', name, args);
    switch (name) {
      case 'setValueReg_String':
        return this.simvar.setValueReg_String(args[0], args[1]);
      case 'setValueReg_Bool':
        return this.simvar.setValueReg_Bool(args[0], args[1]);
      case 'setValueReg_Number':
        return this.simvar.setValueReg_Number(args[0], args[1]);
      case 'setValue_LatLongAlt':
        return this.simvar.setValue_LatLongAlt(args[0], args[1]);
      case 'setValue_LatLongAltPBH':
        return this.simvar.setValue_LatLongAltPBH(args[0], args[1]);
      case 'setValue_PBH':
        return this.simvar.setValue_PBH(args[0], args[1]);
      case 'setValue_PID_STRUCT':
        return this.simvar.setValue_PID_STRUCT(args[0], args[1]);
      case 'setValue_XYZ':
        return this.simvar.setValue_XYZ(args[0], args[1]);
    }
    return Promise.reject(`Unsupported Coherent call: ${name}`);
  }
}

export function RegisterViewListenerFactory(
  registerViewListenerCallback: RegisterViewListenerCallback,
  viewListenerOnCallback: ViewListenerOnCallback,
) {
  return function RegisterViewListener(name: string, callback: () => void) {
    console.log(`[shim](RegisterViewListener) '${name}'`);

    const [listenerID, promise] = registerViewListenerCallback(name);

    promise.then(callback); // TODO handle errors

    // TODO unregister, off
    return {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      on: (event: string, callback: (...args: unknown[]) => void) => {
        viewListenerOnCallback(listenerID, event, callback);
      },

      triggerToAllSubscribers: (event: string, data: unknown[]) => {
        console.log(`[shim][ViewListener](triggerToAllSubscribers) '${event}':`, ...data);
      },

      unregister: () => {
        console.log('[shim][ViewListener](unregister)');
      },
    };
  };
}
