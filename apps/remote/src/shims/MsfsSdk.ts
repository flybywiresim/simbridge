export class BaseInstrument {
  protected constructor() {}

  public connectedCallback(): void {}

  public Update(): void {}

  private dispatchEvent(): void {
    console.log('[shim][BaseInstrument](dispatchEvent)');
  }

  public getGameState(): GameState {
    return GameState.ingame;
  }
}

export function registerInstrument(id: string, Instrument: new () => BaseInstrument) {
  const instance = new Instrument();

  instance.connectedCallback();
  (window as unknown as { FBW_REMOTE_INTERVAL: number | null }).FBW_REMOTE_INTERVAL = window.setInterval(
    () => instance.Update(),
    50,
  );
}

export enum RunwayDesignator {
  RUNWAY_DESIGNATOR_NONE,
  RUNWAY_DESIGNATOR_LEFT,
  RUNWAY_DESIGNATOR_RIGHT,
  RUNWAY_DESIGNATOR_CENTER,
  RUNWAY_DESIGNATOR_WATER,
  RUNWAY_DESIGNATOR_A,
  RUNWAY_DESIGNATOR_B,
}

export enum GameState {
  mainmenu,
  loading,
  briefing,
  ingame,
}

export function LaunchFlowEvent(event: string, key: string, bus: string, data: string) {
  console.log(event, key, bus, JSON.parse(data));
}
