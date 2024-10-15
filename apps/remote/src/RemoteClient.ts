import { v4 } from 'uuid';
import { applicationStore } from './store';
import { clearFlightState, setFlightState } from './store/flightState';
import { appendMessage } from './store/messages';
import { updateSimVarValue } from './store/simVars';
import { ConnectionPhase, updateConnectionState } from './store/connection';
import { protocolV0 } from '@flybywiresim/remote-bridge-types';
import { updateDataStorageKey } from './store/dataStorage';

const MAX_CONNECTION_ATTEMPTS = 10;

export type SimVarSubscribeCallback = (type: 'simVar' | 'globalVar', name: string, unit: string) => number;

export type SimVarSetCallback = (name: string, unit: string, value: unknown) => Promise<void>;

export type DataStorageSetCallback = (key: string, value: string) => void;

export type RegisterViewListenerCallback = (
  name: string,
) => [listenerID: string, listenerRegisteredPromise: Promise<void>];

export type ViewListenerOnCallback = (
  listenerID: string,
  event: string,
  callback: (...args: unknown[]) => void,
) => string;

export type ViewListenerOffCallback = (subscriptionID: string) => void;

interface PendingViewListenerOnCall {
  event: string;
  subscriptionID: string;
  subscriptionGroupID: string;
}

export interface RemoteClientEvents {
  connectionRegained: void;
}

export interface RemoteClientEventSubscription {
  cancel: () => void;
}

export class RemoteClient {
  private static readonly PROTOCOL_VERSION = 0;

  private ws: WebSocket | null = null;

  private clientID = v4();

  private connectionAttemptCount = 0;

  private successfulConnectionCount = 0;

  private heartbeatTimeout: number | null = null;

  private enumerateInstrumentsPromiseResolveFn: ((value: protocolV0.InstrumentMetadata[]) => void) | undefined =
    undefined;

  private firstFrameViewListenerOnCalls: Record<string, PendingViewListenerOnCall[] | undefined> = {};

  private awaitedMessagesTypesToKeys = new Map<string, string>();

  private awaitedMessagesPromiseFns: Record<string, [(arg: any) => void, (arg: any) => void][]> = {};

  private queuedUnhandledMessages: protocolV0.Messages[] = [];

  private asyncOperationPromiseFns = new Map<string, [(arg: any) => void, (arg: any) => void]>();

  private eventSubscriptionCallbacks = new Map<string, (data: unknown[]) => void>();

  private readonly eventSubscriptions: Record<keyof RemoteClientEvents, (() => void)[]> = {
    connectionRegained: [],
  };

  constructor(private readonly url: string) {
    this.attemptConnect();
  }

  public on(event: keyof RemoteClientEvents & string, handler: () => void): RemoteClientEventSubscription {
    this.eventSubscriptions[event].push(handler);

    return {
      cancel: () => {
        this.eventSubscriptions[event].splice(this.eventSubscriptions[event].indexOf(handler), 1);
      },
    };
  }

  private emitEvent(event: keyof RemoteClientEvents & string): void {
    for (const handler of this.eventSubscriptions[event]) {
      handler();
    }
  }

  public enumerateInstruments(): Promise<protocolV0.InstrumentMetadata[]> {
    this.sendMessage({ type: 'remoteEnumerateInstruments', fromClientID: this.clientID });

    return new Promise((resolve) => {
      this.enumerateInstrumentsPromiseResolveFn = resolve;
    });
  }

  public async downloadFile(fileVfsPath: string): Promise<Uint8Array> {
    const requestID = v4();

    try {
      this.sendMessage({
        type: 'remoteDownloadFile',
        requestID,
        fileVfsPath,
        fromClientID: this.clientID,
      });

      const chunks: Uint8Array[] = [];

      let doneDownloading = false;
      while (!doneDownloading) {
        const nextChunk = await this.awaitMessageOfType<protocolV0.AircraftSendFileChunkMessage>(
          'aircraftSendFileChunk',
          requestID,
        );

        if (nextChunk.requestID !== requestID) {
          continue;
        }

        console.log(
          `[RemoteClient](downloadFile) Received chunk #${nextChunk.chunkIndex + 1} / ${
            nextChunk.chunkCount
          } for request ${requestID}`,
        );

        const chunk = await (await fetch(`data:application/octet-stream;base64,${nextChunk.data}`))
          .arrayBuffer()
          .then((it) => new Uint8Array(it));

        chunks.push(chunk);

        if (nextChunk.chunkIndex === nextChunk.chunkCount - 1) {
          console.log(`[RemoteClient](downloadFile) Done downloading for request ${requestID}`);
          this.stopAwaitingMessages('aircraftSendFileChunk', requestID);
          doneDownloading = true;
        }
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      const mergedArray = new Uint8Array(totalLength);

      let offset = 0;
      for (const item of chunks) {
        mergedArray.set(item, offset);
        offset += item.length;
      }

      return mergedArray;
    } catch (e) {
      this.stopAwaitingMessages('aircraftSendFileChunk', requestID);
      throw e;
    }
  }

  public subscribeToSimVar(
    type: 'simVar' | 'globalVar',
    name: string,
    unit: string,
    id: number,
    subscriptionGroupID: string | null,
  ): void {
    if (!subscriptionGroupID) {
      return;
    }

    this.sendMessage({
      type: 'remoteSubscribeToSimVar',
      simVarType: type,
      simVar: name,
      unit,
      id,
      subscriptionGroupID,
      fromClientID: this.clientID,
    });
  }

  public setDataStorageKey(key: string, value: string): void {
    this.sendMessage({
      type: 'remoteSetDataStorageKey',
      key,
      value,
      fromClientID: this.clientID,
    });
  }

  public setSimVarValue(name: string, unit: string, value: unknown): Promise<void> {
    const requestID = v4();

    this.sendMessage({
      type: 'remoteSetSimVarValue',
      name,
      unit,
      value,
      requestID,
      fromClientID: this.clientID,
    });

    return new Promise((resolve, reject) => {
      this.asyncOperationPromiseFns.set(requestID, [resolve, reject]);
    });
  }

  public registerViewListener(name: string, listenerID: string): Promise<void> {
    const requestID = v4();

    this.firstFrameViewListenerOnCalls[listenerID] = [];

    // We wait 100ms to let .on() calls be collected and sent along with the remoteRegisterViewListener message.
    // This ensures any events that are emitted the moment the ViewListener is registered are captured, if need be.
    setTimeout(() => {
      this.sendMessage({
        type: 'remoteRegisterViewListener',
        listenerName: name,
        listenerID,
        firstFrameCalls: this.firstFrameViewListenerOnCalls[listenerID]!,
        requestID,
        fromClientID: this.clientID,
      });

      this.firstFrameViewListenerOnCalls[listenerID] = undefined;
    }, 100);

    return new Promise((resolve, reject) => {
      this.asyncOperationPromiseFns.set(requestID, [resolve, reject]);
    });
  }

  public viewListenerOn(
    listenerID: string,
    event: string,
    callback: (...data: unknown[]) => void,
    subscriptionID: string,
    subscriptionGroupID: string,
  ): void {
    if (this.firstFrameViewListenerOnCalls[listenerID]) {
      this.firstFrameViewListenerOnCalls[listenerID]?.push({ event, subscriptionID, subscriptionGroupID });
    } else {
      this.sendMessage({
        type: 'remoteViewListenerOn',
        listenerID,
        event,
        subscriptionID,
        subscriptionGroupID,
        fromClientID: this.clientID,
      });
    }

    this.eventSubscriptionCallbacks.set(subscriptionID, (data) => callback(...data));
  }

  public viewListenerOff(subscriptionID: string): void {
    this.eventSubscriptionCallbacks.delete(subscriptionID);

    this.sendMessage({
      type: 'remoteSubscriptionCancel',
      subscriptionID,
      fromClientID: this.clientID,
    });
  }

  public cancelSubscriptionGroup(subscriptionGroupID: string): void {
    this.sendMessage({
      type: 'remoteSubscriptionGroupCancel',
      subscriptionGroupID,
      fromClientID: this.clientID,
    });
  }

  private attemptConnect(): void {
    this.connectionAttemptCount++;
    try {
      this.ws = new WebSocket(this.url);
      this.ws.addEventListener('error', () => this.onConnectFailed());
      this.ws.addEventListener('open', () => this.onOpened());
      this.ws.addEventListener('message', (msg) => this.onMessage(msg.data));
      this.ws.addEventListener('close', () => this.onClosed());
    } catch (e: any) {
      console.error(`[RemoteClient](attemptConnect) Could not create WebSocket: ${e.message}`);
      this.onConnectFailed();
    }
  }

  private onConnectFailed(): void {
    if (this.ws) {
      this.ws.close();
    }
    this.ws = null;

    if (this.connectionAttemptCount < MAX_CONNECTION_ATTEMPTS) {
      this.scheduleConnectionAttempt();
    } else {
      console.error(
        `[RemoteClient](onConnectFailed) Reached max connection attempts (${MAX_CONNECTION_ATTEMPTS}), not trying again`,
      );
    }
  }

  private onOpened(): void {
    if (!this.ws) {
      return;
    }

    // applicationStore.dispatch(updateConnectionState({ connected: ConnectionPhase.ConnectedToBridge }));
    //
    // this.sendMessage({ type: 'remoteSignin', clientName: 'remote', fromClientID: this.clientID });
    // this.sendMessage({ type: 'remoteRequestAircraftSignin', fromClientID: this.clientID });
    //
    // this.heartbeatTimeout = setInterval(() => {
    //   this.sendMessage({ type: 'protocolHeartbeat', fromClientID: this.clientID });
    // }, 1_000) as unknown as number;
  }

  private onMessage(message: string): void {
    const msg: protocolV0.Messages = JSON.parse(message);

    applicationStore.dispatch(appendMessage({ direction: 'down', contents: message }));

    let messageHandled = false;
    if (this.awaitedMessagesPromiseFns[msg.type]) {
      while (this.awaitedMessagesPromiseFns[msg.type].length > 0) {
        const [resolve] = this.awaitedMessagesPromiseFns[msg.type][0];
        console.log(`calling handler`, resolve, 'for message type', msg.type);

        messageHandled = true;
        resolve(msg);

        this.awaitedMessagesPromiseFns[msg.type].shift();
      }
    }

    switch (msg.type) {
      case 'protocolGatewayIntroductionMessage':
        if (msg.minProtocolVersion > RemoteClient.PROTOCOL_VERSION) {
          console.error(
            `[RemoteClient](onMessage) Gateway server minProtocolVersion is too high (${msg.minProtocolVersion}). Disconnecting`,
          );
          this.ws?.close();
          return;
        }

        if (msg.maxProtocolVersion < RemoteClient.PROTOCOL_VERSION) {
          console.error(
            `[RemoteClient](onMessage) Gateway server maxProtocolVersion is too low (${msg.minProtocolVersion}). Disconnecting`,
          );
          this.ws?.close();
          return;
        }

        console.log(`[RemoteClient] Connected to server '${msg.server}'. Logging in...`);

        applicationStore.dispatch(updateConnectionState({ connected: ConnectionPhase.ConnectedToBridge }));

        this.sendMessage({ type: 'remoteSignin', clientName: 'remote', fromClientID: this.clientID });
        this.sendMessage({ type: 'remoteRequestAircraftSignin', fromClientID: this.clientID });

        this.heartbeatTimeout = setInterval(() => {
          this.sendMessage({ type: 'protocolHeartbeat', fromClientID: this.clientID });
        }, msg.heartbeatMaxInterval) as unknown as number;
        return;
      case 'aircraftSignin':
        applicationStore.dispatch(
          updateConnectionState({ connected: ConnectionPhase.ConnectedToAircraft, clientName: msg.clientName }),
        );

        this.sendMessage({ type: 'remoteRequestDataStorage', fromClientID: this.clientID });

        // TODO If we were attempting to reconnect after losing connection, we need to recall everything we subscribed to and
        // re-subscribe to it. For now though, we should just reload the gauge.
        // We should also probably have hooks into the gauge that lets it re-initialise any state it might need that is normally sent with the assumption
        // that it is always recieved (for example, fms-v2 fp sync)

        if (this.successfulConnectionCount > 0) {
          this.emitEvent('connectionRegained');
        }
        this.successfulConnectionCount++;

        return;
      case 'aircraftClientDisconnect':
        applicationStore.dispatch(
          updateConnectionState({ connected: ConnectionPhase.ConnectedToBridge, clientName: '' }),
        );
        applicationStore.dispatch(clearFlightState());
        return;
      case 'aircraftSendSimVarValues':
        for (let i = 0; i < msg.values.length; i++) {
          const [id, value] = msg.values[i];

          applicationStore.dispatch(updateSimVarValue({ id, value }));
        }
        return;
      case 'aircraftSendDataStorage':
        for (const [key, value] of Object.entries(msg.values)) {
          applicationStore.dispatch(updateDataStorageKey({ key, value }));
        }
        return;
      case 'aircraftSendInstruments':
        if (!this.enumerateInstrumentsPromiseResolveFn) {
          return;
        }

        this.enumerateInstrumentsPromiseResolveFn(msg.instruments);
        return;
      case 'aircraftAsyncOperationResponse': {
        const requestID = msg.requestID;

        if (!this.asyncOperationPromiseFns.has(requestID)) {
          console.warn(
            '[RemoteClient](onMessage) aircraftAsyncOperationResponse recieved but associated requestID unknown',
          );
          return;
        }

        const [resolve, reject] = this.asyncOperationPromiseFns.get(requestID)!;

        if (msg.successful) {
          resolve(msg.result);
        } else {
          reject(msg.result);
        }

        return;
      }
      case 'aircraftEventNotification': {
        const callback = this.eventSubscriptionCallbacks.get(msg.subscriptionID);

        if (callback) {
          callback(msg.data);
        }
        return;
      }
      case 'aircraftStatus': {
        applicationStore.dispatch(setFlightState(msg));
        return;
      }
      default:
        console.warn(`unknown message type: ${msg.type}`);
    }

    if (!messageHandled) {
      this.queuedUnhandledMessages.push(msg);
    }
  }

  private onClosed(): void {
    if (this.heartbeatTimeout !== null) {
      clearInterval(this.heartbeatTimeout);
    }

    if (this.ws) {
      this.ws.close();
    }

    this.queuedUnhandledMessages.length = 0;
    this.firstFrameViewListenerOnCalls = {};
    this.awaitedMessagesTypesToKeys.clear();
    this.awaitedMessagesPromiseFns = {};
    this.asyncOperationPromiseFns.clear();
    this.eventSubscriptionCallbacks.clear();

    applicationStore.dispatch(updateConnectionState({ connected: ConnectionPhase.NotConnected }));

    this.ws = null;
  }

  private sendMessage(message: protocolV0.Messages) {
    if (!this.ws) {
      throw new Error('Cannot send message if no websocket exists');
    }

    // TODO Connection state, msg queue
    const msgString = JSON.stringify(message);

    applicationStore.dispatch(appendMessage({ direction: 'up', contents: msgString }));

    this.ws.send(msgString);
  }

  private async awaitMessageOfType<M extends protocolV0.Messages>(
    type: M['type'] & string,
    uniqueKey: string,
  ): Promise<M> {
    if (this.awaitedMessagesTypesToKeys.has(type) && this.awaitedMessagesTypesToKeys.get(type) !== uniqueKey) {
      throw new Error(
        '[RemoteClient](awaitMessageOfType) Messages can only be awaited by one consumer at a time. Make sure to call stopAwaitingMessages after you are done handling messages',
      );
    }

    this.awaitedMessagesTypesToKeys.set(type, uniqueKey);

    const firstUnhandledMessagesIndex = this.queuedUnhandledMessages.findIndex((it) => it.type === type);

    if (firstUnhandledMessagesIndex !== -1) {
      const msg = this.queuedUnhandledMessages[firstUnhandledMessagesIndex];

      this.queuedUnhandledMessages.splice(firstUnhandledMessagesIndex, 1);

      return msg as M;
    }

    return new Promise((resolve, reject) => {
      let array = this.awaitedMessagesPromiseFns[type];
      if (!array) {
        array = this.awaitedMessagesPromiseFns[type] = [];
      }

      array.push([resolve, reject]);
    });
  }

  private stopAwaitingMessages(type: string, uniqueKey: string): void {
    if (this.awaitedMessagesTypesToKeys.get(type) === uniqueKey) {
      this.awaitedMessagesTypesToKeys.delete(type);
      return;
    }
  }

  private scheduleConnectionAttempt(): void {
    setTimeout(() => this.attemptConnect(), 3_000);
  }
}
