import os

path = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "assets", "web", "dock", "dock.js")
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

target_refresh = """async function refresh() {
  try { state = await (await fetch("/api/state")).json(); } catch {}
  if (state && Date.now() - wxAt > 30 * 60e3) await loadWeather();
  render();
}"""

replacement_refresh = """/* ---------- dynamic geolocation resolver ---------- */
let geoCheckedAt = 0;
async function resolveDynamicLocation(force = false) {
  const s = state?.settings;
  if (s && s.autoLocation === false && !force) return;
  if (!force && Date.now() - geoCheckedAt < 3 * 3600 * 1000) return;
  geoCheckedAt = Date.now();

  try {
    let lat = null, lon = null, place = null;
    try {
      const r = await (await fetch("https://get.geojs.io/v1/ip/geo.json")).json();
      if (r && r.latitude && r.longitude) {
        lat = parseFloat(r.latitude);
        lon = parseFloat(r.longitude);
        place = r.city ? `${r.city}, ${r.region || r.country || ""}`.trim().replace(/,\s*$/, "") : null;
      }
    } catch {}

    if (!lat || !lon) {
      try {
        const r2 = await (await fetch("https://ipwho.is/")).json();
        if (r2 && r2.success) {
          lat = r2.latitude;
          lon = r2.longitude;
          place = r2.city ? `${r2.city}, ${r2.region || r2.country || ""}`.trim().replace(/,\s*$/, "") : null;
        }
      } catch {}
    }

    if (lat != null && lon != null) {
      const curLat = s?.lat ?? 0, curLon = s?.lon ?? 0;
      const moved = Math.abs(curLat - lat) > 0.05 || Math.abs(curLon - lon) > 0.05 || !s?.place;
      if (moved || force) {
        if (!state) state = { settings: {} };
        if (!state.settings) state.settings = {};
        state.settings.lat = parseFloat(lat.toFixed(4));
        state.settings.lon = parseFloat(lon.toFixed(4));
        if (place) state.settings.place = place;
        state.settings.autoLocation = true;

        fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: state.settings.lat,
            lon: state.settings.lon,
            place: state.settings.place,
            autoLocation: true
          })
        }).catch(() => {});

        await loadWeather();
        render();
      }
    }
  } catch (err) {}
}

async function refresh() {
  try { state = await (await fetch("/api/state")).json(); } catch {}
  if (state?.settings?.autoLocation !== false) {
    resolveDynamicLocation();
  }
  if (state && Date.now() - wxAt > 30 * 60e3) await loadWeather();
  render();
}"""

if target_refresh in content:
    content = content.replace(target_refresh, replacement_refresh)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("Successfully added dynamic geolocation to dock.js")
else:
    print("Error: target_refresh not found in dock.js")
