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
export const NavigationDisplayArcModePixelHeightA32NX = 492;
export const NavigationDisplayRoseModePixelHeightA32NX = 250;
export const NavigationDisplayArcModePixelHeightA380X = 592;
export const NavigationDisplayRoseModePixelHeightA380X = 592;
export const NavigationDisplayMaxPixelHeight = Math.max(
  NavigationDisplayArcModePixelHeightA32NX,
  NavigationDisplayRoseModePixelHeightA32NX,
  NavigationDisplayArcModePixelHeightA380X,
  NavigationDisplayRoseModePixelHeightA380X,
);
export const NavigationDisplayCenterOffsetYA32NX = 0;
export const NavigationDisplayArcModeCenterOffsetYA380X = 100;
export const NavigationDisplayRoseModeCenterOffsetYA380X = 350;

// vertical display parameters
export const VerticalDisplayMapStartOffsetY = 800;
export const VerticalDisplayMapStartOffsetX = 150;

// rendering parameters
export const RenderingMapTransitionDeltaTime = 40;
export const RenderingMapTransitionDurationArcMode = 1500;
export const RenderingMapUpdateTimeoutArcMode = 1000;
export const RenderingMapTransitionDurationScanlineMode = 600;
export const RenderingMapUpdateTimeoutScanlineMode = 500;
export const RenderingMapFrameValidityTimeArcMode =
  RenderingMapTransitionDurationArcMode + RenderingMapUpdateTimeoutArcMode;
export const RenderingMapFrameValidityTimeScanlineMode =
  RenderingMapTransitionDurationScanlineMode + RenderingMapUpdateTimeoutScanlineMode;
