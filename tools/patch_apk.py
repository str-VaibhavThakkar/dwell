import zipfile
import os

base_apk = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "bin", "desk-dock-onclite-debug.apk"))
out_apk = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "bin", "desk-dock-onclite-debug-patched.apk"))

replacements = {
    "assets/web/control/index.html": os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "assets", "web", "control", "index.html")),
    "assets/web/dock/index.html": os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "assets", "web", "dock", "index.html")),
    "assets/web/dock/dock.css": os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "assets", "web", "dock", "dock.css")),
    "assets/web/dock/dock.js": os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "assets", "web", "dock", "dock.js")),
}

replacement_data = {}
for arcname, fpath in replacements.items():
    with open(fpath, "rb") as f:
        replacement_data[arcname] = f.read()

with zipfile.ZipFile(base_apk, "r") as zin:
    with zipfile.ZipFile(out_apk, "w", compression=zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename in replacement_data:
                zout.writestr(item, replacement_data[item.filename])
                print(f"Replaced: {item.filename} ({len(replacement_data[item.filename])} bytes)")
            else:
                zout.writestr(item, zin.read(item.filename))

print(f"Successfully generated patched APK at: {out_apk}")
