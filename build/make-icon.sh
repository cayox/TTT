#!/bin/sh
# Regenerates build/icon.png (1024) and build/icon.icns from build/icon.svg.
# Needs macOS (qlmanage renders the SVG with WebKit; sips, iconutil) and ImageMagick (magick).
set -e
cd "$(dirname "$0")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# QuickLook paints on white, so render the artwork full-bleed and cut the shape with our own mask.
sed 's|<rect id="body"[^>]*/>|<rect id="body" width="1024" height="1024" fill="url(#bg)"/>|' icon.svg > "$tmp/full.svg"
qlmanage -t -s 1024 -o "$tmp" "$tmp/full.svg" >/dev/null 2>&1
magick -size 1024x1024 xc:none -fill white -draw "roundrectangle 100,100 923,923 185,185" "$tmp/mask.png"
magick "$tmp/full.svg.png" "$tmp/mask.png" -alpha off -compose CopyOpacity -composite "$tmp/body.png"
magick "$tmp/mask.png" -channel RGB -evaluate set 0 +channel -channel A -evaluate multiply 0.4 +channel -blur 0x14 "$tmp/shadow.png"
magick -size 1024x1024 xc:none "$tmp/shadow.png" -geometry +0+10 -composite "$tmp/body.png" -composite icon.png

mkdir "$tmp/icon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s icon.png --out "$tmp/icon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d icon.png --out "$tmp/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$tmp/icon.iconset" -o icon.icns
