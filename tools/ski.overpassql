[out:json][timeout:180];
(
  way["piste:type"="downhill"]({{bbox}});
  relation["piste:type"="downhill"]({{bbox}});
  way["aerialway"]({{bbox}});
);
out geom;
