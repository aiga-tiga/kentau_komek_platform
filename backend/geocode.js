// Turns a typed address into lat/lng so it can be shown on the analytics map,
// per the spec: "written address should automatically show as geolocation on the map".
//
// Uses OpenStreetMap's free Nominatim service by default. For better coverage of
// Kazakh addresses in production, swap this for the Yandex Geocoder or 2GIS API
// (both are referenced in the reference screenshots) - just replace the fetch below
// and keep the same { lat, lng } return shape.

async function geocodeAddress(address, region) {
  if (!address) return { lat: null, lng: null };

  const query = encodeURIComponent(`${address}, ${region || ""}, Kazakhstan`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

  try {
    const resp = await fetch(url, { headers: { "User-Agent": "complaints-app/1.0" } });
    const results = await resp.json();
    if (results && results[0]) {
      return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
    }
  } catch (err) {
    console.error("Geocoding failed:", err.message);
  }
  return { lat: null, lng: null };
}

module.exports = { geocodeAddress };
