import os

path = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "assets", "web", "dock", "dock.js")
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_burn_in = """  const k = d.getHours(); $("ui").style.transform = `translate(${(k * 7) % 4 - 1.5}px,${(k * 5) % 4 - 1.5}px)`;  // burn-in drift"""

new_burn_in = """  // Continuous anti-retention micro-drift for IPS LCD:
  // Shifts UI coordinates across a 16-point orbit every 90 seconds to eliminate static DC bias
  const driftStep = Math.floor(Date.now() / 90000) % 16;
  const dx = [-1.5, 0, 1.5, 0, 1, -1, 1.5, -1.5, 0.5, -0.5, 1, -1, 0, 1.5, -1, 0][driftStep];
  const dy = [0, 1.5, 0, -1.5, 1, 1.5, -1, -0.5, 1.5, -1.5, 0, 1, -1.5, 0.5, 1, 0][driftStep];
  $("ui").style.transform = `translate(${dx}px,${dy}px)`;"""

hw_hook = """
/* Hardware button hook for future action routing / page navigation */
window.onHardwareKey = function(dir) {
  const scenes = ["desk", "mountains", "sakura", "sky"];
  const cur = state?.settings?.scene || "desk";
  let i = scenes.indexOf(cur);
  if (dir === "up") i = (i + 1) % scenes.length;
  else if (dir === "down") i = (i - 1 + scenes.length) % scenes.length;
  if (state?.settings) state.settings.scene = scenes[i];
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene: scenes[i] })
  }).catch(() => {});
  render();
};
"""

if old_burn_in in content:
    content = content.replace(old_burn_in, new_burn_in)
    if "window.onHardwareKey" not in content:
        content = content + "\n" + hw_hook
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("Successfully patched dock.js")
else:
    print("Target string not found in dock.js; checking if already patched")
    if "window.onHardwareKey" in content:
        print("dock.js is already patched")
    else:
        print("Error: Target not found")
