#!/system/bin/sh
MOD_DIR="/data/adb/modules/deskdock_keys"
mkdir -p "$MOD_DIR/system/usr/keylayout"
mkdir -p "$MOD_DIR/system/vendor/usr/keylayout"

cat << 'EOF' > "$MOD_DIR/module.prop"
id=deskdock_keys
name=Desk Dock Key Remapping
version=1.0
versionCode=1
author=DeskDock
description=Remaps physical volume keys to PAGE_UP/PAGE_DOWN to permanently suppress SystemUI volume slider HUD and freeze volume.
EOF

# Copy and modify Generic.kl
cp /system/usr/keylayout/Generic.kl "$MOD_DIR/system/usr/keylayout/Generic.kl"
sed -i "s/key 114   VOLUME_DOWN/key 114   PAGE_DOWN/" "$MOD_DIR/system/usr/keylayout/Generic.kl"
sed -i "s/key 115   VOLUME_UP/key 115   PAGE_UP/" "$MOD_DIR/system/usr/keylayout/Generic.kl"

# Copy and modify gpio-keys.kl
cp /vendor/usr/keylayout/gpio-keys.kl "$MOD_DIR/system/vendor/usr/keylayout/gpio-keys.kl"
sed -i "s/key 114   VOLUME_DOWN/key 114   PAGE_DOWN/" "$MOD_DIR/system/vendor/usr/keylayout/gpio-keys.kl"
sed -i "s/key 115   VOLUME_UP/key 115   PAGE_UP/" "$MOD_DIR/system/vendor/usr/keylayout/gpio-keys.kl"

chmod -R 755 "$MOD_DIR"
chmod 644 "$MOD_DIR/module.prop"
chmod 644 "$MOD_DIR/system/usr/keylayout/Generic.kl"
chmod 644 "$MOD_DIR/system/vendor/usr/keylayout/gpio-keys.kl"

echo "Magisk module deskdock_keys created successfully:"
ls -la "$MOD_DIR"
