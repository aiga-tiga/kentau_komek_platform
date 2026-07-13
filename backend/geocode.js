// Turns a typed address into lat/lng so it can be shown on the analytics map,
// per the spec: "written address should automatically show as geolocation on the map".
//
// Uses OpenStreetMap's free Nominatim service by default. For better coverage of
// Kazakh addresses in production, swap this for the Yandex Geocoder or 2GIS API
// (both are referenced in the reference screenshots) - just replace the fetch below
// and keep the same { lat, lng } return shape.

// Rough bounding box around Кентау / Түркістан облысы (lon_min, lat_max, lon_max,
// lat_min). Every complaint here is filed in or near Кентау, but a short street
// name (e.g. "Абая", "Гагарина") also exists in dozens of other Kazakh cities -
// without this, Nominatim sometimes matches the "wrong" city entirely. Combined
// with countrycodes=kz + bounded=1, this keeps results local.
const REGION_VIEWBOX = "66.0,45.6,70.0,40.5";

async function searchNominatim(query, { bounded } = {}) {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=kz` +
    (bounded ? `&viewbox=${REGION_VIEWBOX}&bounded=1` : "");
  const resp = await fetch(url, { headers: { "User-Agent": "complaints-app/1.0" } });
  const results = await resp.json();
  return results && results[0] ? { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) } : null;
}

async function geocodeAddress(address, region) {
  if (!address) return { lat: null, lng: null };

  const query = encodeURIComponent(`${address}, ${region || "Кентау"}, Түркістан облысы, Kazakhstan`);

  try {
    const bounded = await searchNominatim(query, { bounded: true });
    if (bounded) return bounded;

    // Nothing found strictly inside the region box - fall back to an
    // unbounded (but still Kazakhstan-only) search rather than showing
    // nothing on the map at all.
    const unbounded = await searchNominatim(query);
    if (unbounded) return unbounded;
  } catch (err) {
    console.error("Geocoding failed:", err.message);
  }
  return { lat: null, lng: null };
}

module.exports = { geocodeAddress };