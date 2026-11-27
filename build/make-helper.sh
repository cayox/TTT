#!/bin/sh
# Builds build/TTT Location.app (universal arm64 + x86_64) from src/main/wifi/helper/ssid.swift.
# Needs Xcode command line tools.
#
# It has to be a real app bundle: locationd only shows the Location prompt for clients that Launch
# Services knows as an app. A bare executable (even one with an Info.plist linked in) is silently
# left at "not determined". LSUIElement keeps it out of the Dock; TTT registers it with Launch
# Services before asking (src/main/wifi/location.ts). Keep the strings in sync with extendInfo in
# electron-builder.yml.
set -e
cd "$(dirname "$0")"
src=../src/main/wifi/helper/ssid.swift
app="TTT Location.app"
version=$(node -p "require('../package.json').version")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

rm -rf "$app" ssid-helper
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos12" "$src" -o "$tmp/$arch"
done
lipo -create "$tmp/arm64" "$tmp/x86_64" -output "$app/Contents/MacOS/ssid-helper"
cp icon.icns "$app/Contents/Resources/icon.icns"

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.cayox.ttt.location</string>
  <key>CFBundleName</key><string>TTT</string>
  <key>CFBundleDisplayName</key><string>TTT</string>
  <key>CFBundleExecutable</key><string>ssid-helper</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSLocationUsageDescription</key><string>TTT reads the name of your Wi-Fi network to start and stop tracking at work.</string>
  <key>NSLocationWhenInUseUsageDescription</key><string>TTT reads the name of your Wi-Fi network to start and stop tracking at work.</string>
</dict>
</plist>
PLIST

codesign --force --sign - "$app"
