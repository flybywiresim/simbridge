// execution parameters
export const GpuProcessingActive = true;

// mathematical conversion constants
export const FeetPerNauticalMile = 6076.12;
export const ThreeNauticalMilesInFeet = 18228.3;
export const NauticalMilesToMetres = 1852;
export const RenderingColorChannelCount = 4;

// map grid creation
export const InvalidElevation = 32767;
export const UnknownElevation = 32766;
export const WaterElevation = -1;
export const DefaultTileSize = 300;

// navigation display parameters
export const NavigationDisplayMapStartOffsetY = 128;
export const NavigationDisplayMaxPixelWidth = 768;
export const NavigationDisplayArcModePixelHeight = 492;
export const NavigationDisplayRoseModePixelHeight = 250;
export const NavigationDisplayMaxPixelHeight = Math.max(NavigationDisplayArcModePixelHeight, NavigationDisplayRoseModePixelHeight);

// rendering parameters
export const RenderingMapTransitionDeltaTime = 40;
export const RenderingMapTransitionDuration = 1000;
export const RenderingMapUpdateTimeout = 1500;
export const RenderingMapFrameValidityTime = RenderingMapTransitionDuration + RenderingMapUpdateTimeout;
