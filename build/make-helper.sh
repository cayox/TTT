#!/bin/sh
# Builds build/ssid-helper (universal arm64 + x86_64) from src/main/wifi/helper/ssid.swift. Needs Xcode command line tools.
set -e
cd "$(dirname "$0")"
src=../src/main/wifi/helper/ssid.swift
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
swiftc -O -target arm64-apple-macos12 "$src" -o "$tmp/arm64"
swiftc -O -target x86_64-apple-macos12 "$src" -o "$tmp/x86_64"
lipo -create "$tmp/arm64" "$tmp/x86_64" -output ssid-helper
