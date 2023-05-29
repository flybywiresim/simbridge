# Terrain map documentation

The terrain map in the FBW SimBridge is used to provide elevation data.
It is possible to use the elevation maps for several use cases.
Currently is it mainly used to create the terrain on navigation display,
but is also planned to be used as a line-of-sight analysis for the VDL simulation.

The publicly availabe SRTM dataset is used as the source to create the internal map format.

The complete terrain map with all rendering and management logic is part of a worker thread
in the SimBridge server to avoid timeout-responses for WebSocket-requests if map processing
takes longer than expected.

The Nest.JS-server controls the worker thread via named messages.
It is possible to request specific information from the thread
(like the terrain map with transition frames)
or to stop the worker thread and to cleanup all GPU related storage.

## Terrain map file format

In a preprocessing step is the SRTM dataset converted into an internal format to reduce the
required memory footprint and to adapt the resolution to the targets for the terrain on
navigation display map.

The terrain map is splitted into tiles where each tile's dimension is 1 by 1 degree in the
WGS84 coordinate system. Each tile information is downsampled in latitude and longitude direction.
Additionally are the elevations downsampled by 30 metres height and encoded as indices per elevation.
In a last step is the created elevation map compressed by use of the GZip compression.

The final internal map format is defined by a file header and the tile descriptors with the
little-endian encoding. A file header specifies the latitude and longitude ranges, the angular steps
per tile and the horizontal resolution in feets.
The latitude and longitude ranges define the maximum ranges in which data is available.
The terrain map does not contain data for the entire world.

```c
struct FileHeader {
    std::int16_t latitude_min;
    std::int16_t latitude_max;
    std::int16_t longitude_min;
    std::int16_t longitude_max;
    std::uint8_t angular_step_latitude;
    std::uint8_t angular_step_longitude;
    float horizontal_resolution;
}
```

Not every possible tile contains relevant data. For example areas that contain only water are not
stored in the map. Every defined tile is described by it's own header and followed by the elevation
data for the tile. It is possible to use the elevation map dimension of a tile and the angular steps
to calculate the metrical resolution of one pixel of a specific tile.

```c
struct TileHeader {
    std::uint16_t pixels_per_row;
    std::uint16_t pixels_per_column;
    std::int8_t southwest_latitude;
    std::int16_t southwest_longitude;
    std::uint32_t elevationmap_byte_count;
}
```

## Communication from MSFS to FBW SimBridge

The general communication between the FBW aircraft and the terrain map manager in the SimBridge is
done via the MSFS-SimConnect client data area definition. This allows an efficient and nearly
latency free communication.

The terrain map manager requires two different kinds of information.

A first block contains ground truth information without respecting the current status of the used
aircraft in the simulator. The ground truth data contains the latitude and longitude coordinate of
the aircraft. This information is required to create the cache for the relevant tiles.
This ground truth data is required to provide data for internal systems that are based on elevation
data but do not require correct EGPWC setups.

The second block contains information that are required to simulate the terrain map on ND as accurate
as possible and respects the states of the aircraft systems.

The client data area is defined by the following structure:
```c
struct EgpwcAircraftStatus {
    std::uint8_t adiru_data_valid;
    float adiru_latitude;
    float adiru_longitude;
    std::int32_t adiru_altitude;
    std::int16_t adiru_heading;
    std::int16_t adiru_vertical_speed;
    std::uint8_t gear_is_down;
    std::uint8_t destination_data_valid;
    float destination_latitude;
    float destination_longitude;
    std::uint16_t navigation_display_capt_range;
    std::uint8_t navigation_display_capt_arc_mode;
    std::uint8_t navigation_display_capt_terr_on_nd_active;
    std::uint16_t navigation_display_fo_range;
    std::uint8_t navigation_display_fo_arc_mode;
    std::uint8_t navigation_display_fo_terr_on_nd_active;
    std::uint8_t navigation_display_rendering_mode;
    float ground_truth_latitude;
    float ground_truth_longitude;
}
```

The rendering mode in the structure defines if the transition simulation needs to follow the arc or
if it uses the vertical transition for the A380. Internally changes the flag also the patterns for
the pixel activation during the rendering.

## Map handling concept

The system stores all information about the relevant elevation data on the GPU in a texture.
Based on the ground truth position are the relevant tiles loaded and stiched together to one big image.
At the moment is a radius of 700 nm used to create the stiched map to support also the A380.

If tiles do not exist in the relevant areas are they filled based on the direct neighbor dimensions.
Two different situation result in missing tile data. The first situation is a water area and therefore is
the missing data filled by water marker entries.
The second situation occurs as soon as the aircraft leaves the area where map data is in general available.
The missing areas areas are filled with invalid entries to visualize them in a specific way.

With every update is it checked if new tiles need to be loaded or old ones need to be removed.
A complete recreation of the stiched elevation map is triggered in these cases.

## Terrain on ND rendering logic

The rendering of the display image is done on the GPU in several stages.
GPU.JS is used to enable the GPU processing. The framework expects TypeScript functions with
additional information about parameters and the real types of the formats.
Afterwards is the code dynamically translated to WebGL 1.0 code that is executed in Headless-GL.

The following sub chapters describe the full rendering logic.

### Elevation map extraction

Based on the current aircraft position of the ADIRU, the ND configuration and the heading are the
elevation values extracted into an image that fits to the target dimensions.
The resulting elevation image is kept on the GPU as an intermediate result for following GPU kernels.

### Elevation statistic calculation

The elevation statistic is used to parameterize the peaks- and non-peaks-rendering modes.

To optimize for computational time is a two-stage histogram calculation used.
The first stage is responsible to calculate the local histogram for a sub-pixel area of the
elevation image. This increases the paralallization over the full image.
The second stage collects the data of the local histogram and merges them into a global histogram.
All histograms are calculated and kept on the GPU for the rendering kernels.

Every per-pixel-rendering kernel calculates the final statistics for the peaks- and
non-peaks-rendering mode. The computation is much cheaper compared to the computation in a single
kernel or on the CPU with data transfer.

One speciality of the rendering kernels is that the number of rows for the resulting terrain on ND
image is extended by one row. This allows the rendering kernels to store the statistics to provide
the results like minimum elevation, maximum elevation and rendering mode in the last row.
This concept is known from embedded cameras that need to provide parameter sets to functions that
consume the data.

This final image is transferred to the RAM of the CPU and can be consumed by the simulator and other 
systems.

### Pixel activation lookup table

Not every pixel visualizes a elevation height on the navigation display.
Therefore is a logic required to activate or deactivate a pixel of the final image.

Instead of creating a big if-else-block, which is really expensive on the GPU, is a lookup table
a-priory created that encodes the activation logic per pixel.

The terrain on ND knows four different kinds of activation modes:
 - Low density
 - High density / Unknown elevation / Invalid elevation
 - Water
 - Solid

The solid-case is trivial because every pixel is active.
For the low- and high-density and water cases are masks required.

All three modes are encoded as prime numbers. Low density is encoded as 3, high density as 5 and
water as 7. If a pixel is inactive in every case is the value 0 and if the pixel is active for multiple
cases are the prime numbers multiplicated.

This prime number logic has the advantage that a check if a pixel is active or not is reduced to a 
modulo-operation. The pixel is active if the remainder of the integer division between the pattern value and the prime number of the activation mode is zero.

### Map transition logic

The map transition logic simulates the time duration since system start.
This emulates the real system logic. The real system reserves computation time to render the image and
uses the remaining time if the pilot activates the rendering in this time period.

The SimBridge uses the time simulations to check which kind of transition is required.
It analysis as soon as the pilot activates the terrain on ND how much time is remaining to calculate
parts of the first navigation display frame.

For the normal transition between two frames is a normal transition between the old and the new navigation 
frame used.

The SimBridge handles the complete time management including the frame rates for the transition frames.

## Communication from FBW SimBridge to MSFS

The SimBridge sends every frame as PNG encoded image to the simulator via a client data area block.
The client data area size is limited to 8kB. The image is streamed to the simulator if the image is
bigger than 8kB. Streaming means in this case that the SimBridge sends 8kB chunks until the full image
is sent.

A metadata block with the minimum and maximum elevation, rendering mode and image size of the frame in 
bytes is sent before the stream to the simulator to trigger a frame update run in the visualizer.

These two information streams are defined per side for the captain and first officer.
