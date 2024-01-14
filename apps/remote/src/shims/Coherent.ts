import { simvar } from './SimVar';
import { RegisterViewListenerCallback, ViewListenerOffCallback, ViewListenerOnCallback } from '../RemoteClient';

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
  viewListenerOffCallback: ViewListenerOffCallback,
) {
  return function RegisterViewListener(name: string, callback: () => void) {
    console.log(`[shim](RegisterViewListener) '${name}'`);

    const [listenerID, promise] = registerViewListenerCallback(name);

    promise.then(callback); // TODO handle errors

    const eventSubscriptionIDs = new Map<string, Map<(...args: unknown[]) => void, string>>();

    // TODO unregister
    return {
      on: (event: string, callback: (...args: any[]) => void) => {
        const subscriptionID = viewListenerOnCallback(listenerID, event, callback);

        let existingMap = eventSubscriptionIDs.get(event);

        if (!existingMap) {
          const map = new Map();

          eventSubscriptionIDs.set(event, map);
          existingMap = map;
        }

        existingMap.set(callback, subscriptionID);
      },

      off: (event: string, callback: (...args: unknown[]) => void) => {
        const subscriptionID = eventSubscriptionIDs.get(event)?.get(callback);

        if (subscriptionID) {
          viewListenerOffCallback(subscriptionID);
        }
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
