#!/bin/sh
# Build Slice for Mac (Debug) and relaunch it.
#   ./scripts/run.sh          build + launch
#   ./scripts/run.sh --build  build only
set -e
cd "$(dirname "$0")/.."

xcodegen generate --quiet
xcodebuild -project SliceMac.xcodeproj -scheme SliceMac -configuration Debug \
  -derivedDataPath build/DerivedData -quiet build

[ "$1" = "--build" ] && exit 0

APP="build/DerivedData/Build/Products/Debug/Slice.app"
pkill -x Slice 2>/dev/null && sleep 0.5 || true
open "$APP"
echo "Slice is running ($APP)"
