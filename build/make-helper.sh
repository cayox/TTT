#!/bin/sh
# Builds build/ssid-helper (universal arm64 + x86_64) from src/main/wifi/helper/ssid.swift. Needs Xcode command line tools.
set -e
cd "$(dirname "$0")"
src=../src/main/wifi/helper/ssid.swift
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# A plain executable has no bundle, so macOS reads the Location prompt's text and the identity it
# records from an Info.plist linked into the binary itself. Keep the strings in sync with
# extendInfo in electron-builder.yml.
cat > "$tmp/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.cayox.ttt.ssid-helper</string>
  <key>CFBundleName</key><string>TTT</string>
  <key>CFBundleExecutable</key><string>ssid-helper</string>
  <key>NSLocationUsageDescription</key><string>TTT reads the name of your Wi-Fi network to start and stop tracking at work.</string>
  <key>NSLocationWhenInUseUsageDescription</key><string>TTT reads the name of your Wi-Fi network to start and stop tracking at work.</string>
</dict>
</plist>
PLIST

for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos12" "$src" -o "$tmp/$arch" \
    -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$tmp/Info.plist"
done
lipo -create "$tmp/arm64" "$tmp/x86_64" -output ssid-helper
