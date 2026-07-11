import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

// Renders a heat layer from [{lat, lng}] points on top of the current map.
// Kept as its own component so it can be mounted/unmounted when switching
// between the "points" and "heatmap" tabs without re-creating the map itself.
export default function HeatmapLayer({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    const heatPoints = points.map((p) => [p.lat, p.lng, 0.6]);
    const layer = L.heatLayer(heatPoints, { radius: 28, blur: 20, maxZoom: 16 }).addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
}
