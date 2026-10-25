# Trail wayfinding extension

## Overview
This documents the implemented extension in `trail-signs.js` and the trail controls in `index.html`. Keep the existing Three.js scene, map, and HUD conventions.
Signs are virtual guidance generated from mapped runs, not surveyed resort signs, operational gates, trail status, or verified safety information. Keep that caveat visible in the map trail list.

## Colors
- Route boards and map entry markers: blue `#123966`; board text and forward arrow: white.
- Board rim: `#f7f8f3`; paired support posts: red `#b8442f`.
- Merge boards: yellow `#f2ce36` with dark `#172332` text.
- Difficulty dots reuse `diffOf(route.diff).color`, with a white outline and a written grade so meaning does not depend on color alone.

## Typography
Board textures use bold sans-serif on a 1024 × 320 canvas: route name 55px, grade and bilingual instruction 38px; warning headline 82px and supporting line 43px. Canvas text widths constrain long labels. Map controls inherit the existing body font and list styles.

## Layout
Named, non-area runs longer than 40m become routes. Endpoint elevation orders each segment from uphill to downhill; same-name sections within 8m are joined.
Boards sit 15m beside the route, rotate to face approaching riders, and use a 4.6 × 1.44m panel centered 2.4m above terrain. Two 3.2m posts stand 1.95m either side of center.
Start signs appear 22m along a route; continuation signs begin at 220m and repeat every 300m, excluding the last 90m.
A yellow board appears 55m before the end of routes longer than 120m when another route point lies within 35m of the endpoint. This proximity rule infers a possible merge; it does not establish a verified junction.

## Elevation & Depth
Panels use double-sided Lambert materials and sRGB canvas textures within the existing scene lighting. Shared plane/post geometry and cached materials avoid repeating identical resources.

## Components
- Junction boards use a dark header and up to four colored trail rows, each with a drawn left/right/ahead arrow, mapped name, written grade, and difficulty shape. Panels are 5.4m wide on taller paired posts and face the approach; their reverse face is blank to avoid misleading reverse arrows.
- Junctions are inferred from endpoints within 22m of another trail corridor and within 8m elevation. Boards sit 25m before the connection where possible. Arrow bearings use downstream trail geometry relative to the approaching rider, and disconnected trails are excluded.
- Blue boards show the mapped trail name, difficulty dot and written grade, a forward arrow, and `START / 雪道入口` or `CONTINUE / 沿線前行`.
- Yellow boards show `SLOW` and `MERGE AHEAD · 前方匯流` on the same paired red posts.
- Blue map buttons marked `起` use 3px corners and reuse `.lift-stop` sizing, inverse map scaling, tooltip, accessible label, and keyboard focus treatment.
- The expandable trail list reuses `.lift-list` and `.lift-list-items`, sits above the lift list, sorts routes by name, and displays grade and rounded route length.
- Entry buttons and list items clear lift riding/queue state, drop the rider 3m along the route from its uphill entry, face them along the route downhill, and close the map. Dragging the map suppresses marker activation.

## Do's and Don'ts
- Do reuse `trailRoutes`, `alongTrail`, and `diffOf` for consistent placement, entry direction, and grade labels.
- Do preserve the shared map controls, scene styling, bilingual instructions, forward arrow, and virtual-guidance caveat.
- Don't describe generated signs or inferred merge warnings as real resort infrastructure or live operating advice.
