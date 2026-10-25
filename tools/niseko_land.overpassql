[out:json][timeout:300][maxsize:536870912];
(
  way["landuse"](42.815,140.615,42.905,140.745);
  relation["landuse"]["type"="multipolygon"](42.815,140.615,42.905,140.745);
  way["natural"~"^(wood|scrub|heath|grassland|water|wetland|bare_rock|scree|cliff|tree_row)$"](42.815,140.615,42.905,140.745);
  relation["natural"~"^(wood|scrub|heath|grassland|water|wetland|bare_rock|scree)$"]["type"="multipolygon"](42.815,140.615,42.905,140.745);
  way["waterway"~"^(river|stream|canal|riverbank|ditch)$"](42.815,140.615,42.905,140.745);
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|track|[a-z]+_link)$"](42.815,140.615,42.905,140.745);
  way["railway"="rail"](42.815,140.615,42.905,140.745);
  way["leisure"~"^(golf_course|park|pitch)$"](42.815,140.615,42.905,140.745);
  way["amenity"="parking"](42.815,140.615,42.905,140.745);
  way["building"](42.815,140.615,42.905,140.745);
  relation["building"]["type"="multipolygon"](42.815,140.615,42.905,140.745);
  node["natural"="peak"](42.815,140.615,42.905,140.745);
  node["place"~"^(village|hamlet|neighbourhood|suburb|locality)$"](42.815,140.615,42.905,140.745);
);
out geom;
