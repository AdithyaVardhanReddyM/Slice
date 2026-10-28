#!/bin/bash
# Build a notarized, drag-to-Applications Slice.dmg for people who are not you (hackathon judges).
#
#   SLICE_BRAIN_URL=wss://slice-brain-xxxx.a.run.app/mac/live \
#   SLICE_BRAIN_TOKEN=... \
#     pnpm --filter @slice/mac release
#
#   ./scripts/release.sh --check         only check that this Mac is ready, build nothing
#   ./scripts/release.sh --unnotarized   no Developer ID: sign with your Apple Development
#                                        certificate and skip notarization
#                                        (pnpm --filter @slice/mac release:unnotarized)
#
# What it does: xcodegen, archive the Release configuration, export a Developer ID signed
# Slice.app, notarize and staple it, put it in a DMG next to an Applications shortcut, sign,
# notarize and staple the DMG. Everything lands in apps/mac/build/release (gitignored).
#
# With --unnotarized it takes Slice.app straight from the archive (Apple Development, hardened
# runtime, secure timestamp), builds the same DMG but leaves it unsigned (see step 4), and skips
# notarytool, stapler and the Gatekeeper check. Other Macs block the app's first open; the person
# opens it once with Open Anyway in System Settings, Privacy & Security (docs/mac-release.md).
#
# Needs (docs/mac-release.md has the steps):
#   - a "Developer ID Application" certificate for team 5Q3KU6MZ8A in the login keychain
#     (an "Apple Development" one for that team with --unnotarized)
#   - a notarytool keychain profile called slice-notary (not needed with --unnotarized)
#     (xcrun notarytool store-credentials slice-notary ...)
#
# Optional environment:
#   SLICE_BRAIN_URL    the hosted brain the app connects to by default (wss://.../mac/live). Required
#                      unless you pass --allow-local-brain, because without it the app looks for a
#                      brain on the judge's own Mac.
#   SLICE_BRAIN_TOKEN  the brain's MAC_CLIENT_TOKEN, baked into the app so nobody has to paste it.
#                      Leave it out and judges paste the token into Settings, Brain, Token.
#   SLICE_SIGN_IDENTITY  pick one Developer ID Application certificate (Apple Development with
#                      --unnotarized) by its full name when the keychain holds several.
set -euo pipefail

TEAM_ID="5Q3KU6MZ8A"
NOTARY_PROFILE="slice-notary"
SCHEME="SliceMac"

cd "$(dirname "$0")/.."
OUT="$PWD/build/release"

CHECK_ONLY=0
ALLOW_LOCAL=0
UNNOTARIZED=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --allow-local-brain) ALLOW_LOCAL=1 ;;
    --unnotarized) UNNOTARIZED=1 ;;
    -h|--help) sed -n '2,35p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

BRAIN_URL="${SLICE_BRAIN_URL:-}"
BRAIN_TOKEN="${SLICE_BRAIN_TOKEN:-}"

say() { printf '\n==> %s\n' "$1"; }

# Print a log file's tail with the brain token blanked out.
tail_log() {
  local line
  tail -n 40 "$1" | while IFS= read -r line; do
    if [ -n "$BRAIN_TOKEN" ]; then line="${line//"$BRAIN_TOKEN"/<token>}"; fi
    printf '    %s\n' "$line"
  done
}

# Run one build step with its output in a log file; show the tail only if it fails.
step() {
  local name="$1"; shift
  local log="$OUT/logs/$name.log"
  mkdir -p "$OUT/logs"
  local ok=1
  "$@" >"$log" 2>&1 || ok=0
  # xcodebuild echoes the build settings it was given, so blank the token out of the log.
  if [ -n "$BRAIN_TOKEN" ]; then BRAIN_TOKEN="$BRAIN_TOKEN" perl -pi -e 's/\Q$ENV{BRAIN_TOKEN}\E/<token>/g' "$log"; fi
  if [ "$ok" = 0 ]; then
    echo "Step '$name' failed. Last lines of $log:" >&2
    tail_log "$log" >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------------------
# 1. Is this Mac ready? Collect every problem, then stop once.
# ---------------------------------------------------------------------------------------
say "Checking this Mac"
PROBLEMS=()
problem() { PROBLEMS+=("$1"); }

if ! command -v xcodegen >/dev/null 2>&1; then
  problem "xcodegen is not installed. Install it with:  brew install xcodegen"
fi
if ! xcodebuild -version >/dev/null 2>&1; then
  problem "Xcode's command line tools are not available. Install Xcode, open it once, then:  sudo xcode-select -s /Applications/Xcode.app"
fi
if [ "$UNNOTARIZED" = 0 ] && ! xcrun --find notarytool >/dev/null 2>&1; then
  problem "notarytool was not found. It ships with Xcode 13 and later; update Xcode."
fi

# The team a certificate was issued to (its OU). Apple Development names end in the person's ID,
# not the team's, so the name alone cannot tell.
cert_team() {
  security find-certificate -c "$1" -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null \
    | sed -n 's/.*OU *= *\([A-Z0-9]*\).*/\1/p' | head -n 1
}

IDENTITY=""
if [ "$UNNOTARIZED" = 1 ]; then
  # An Apple Development certificate for our team, with its private key.
  IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development: .*\)".*/\1/p')"
  if [ -n "${SLICE_SIGN_IDENTITY:-}" ]; then
    if grep -qxF "$SLICE_SIGN_IDENTITY" <<<"$IDENTITIES"; then
      IDENTITY="$SLICE_SIGN_IDENTITY"
    else
      problem "SLICE_SIGN_IDENTITY is \"$SLICE_SIGN_IDENTITY\", but that is not a usable Apple Development certificate in your keychain."
    fi
  else
    while IFS= read -r NAME; do
      if [ -n "$NAME" ] && [ "$(cert_team "$NAME")" = "$TEAM_ID" ]; then IDENTITY="$NAME"; break; fi
    done <<<"$IDENTITIES"
    if [ -z "$IDENTITY" ]; then
      problem "No \"Apple Development\" certificate for team $TEAM_ID in your keychain.
    Create one: Xcode > Settings > Accounts > pick the team ($TEAM_ID) > Manage Certificates > + > Apple Development."
    fi
  fi
  if [ -n "$IDENTITY" ] && [ "$(cert_team "$IDENTITY")" != "$TEAM_ID" ]; then
    problem "The certificate \"$IDENTITY\" is not for team $TEAM_ID (the team in project.yml). Use a certificate from the right team, or set SLICE_SIGN_IDENTITY."
  fi
else
  # A Developer ID Application certificate with its private key (the "-v" listing only shows usable ones).
  IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null | grep '"Developer ID Application' || true)"
  if [ -n "${SLICE_SIGN_IDENTITY:-}" ]; then
    if grep -qF "\"$SLICE_SIGN_IDENTITY\"" <<<"$IDENTITIES"; then
      IDENTITY="$SLICE_SIGN_IDENTITY"
    else
      problem "SLICE_SIGN_IDENTITY is \"$SLICE_SIGN_IDENTITY\", but that is not a usable Developer ID Application certificate in your keychain."
    fi
  elif [ -n "$IDENTITIES" ]; then
    # Prefer the certificate that belongs to our team.
    LINE="$(grep -F "($TEAM_ID)" <<<"$IDENTITIES" | head -n 1 || true)"
    [ -n "$LINE" ] || LINE="$(head -n 1 <<<"$IDENTITIES")"
    IDENTITY="$(sed -n 's/.*"\(.*\)".*/\1/p' <<<"$LINE")"
  fi
  if [ -z "$IDENTITY" ] && [ -z "${SLICE_SIGN_IDENTITY:-}" ]; then
    FOUND="$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(.*\)".*/    \1/p')"
    problem "No \"Developer ID Application\" certificate in your keychain, so the app cannot be signed for people outside your team.
    Create one: Xcode > Settings > Accounts > pick the team (5Q3KU6MZ8A) > Manage Certificates > + > Developer ID Application.
    (Usually only the team's Account Holder can; ask them if the option is greyed out. developer.apple.com > Certificates works too.)
    Certificates found on this Mac (an Apple Development one is not enough):
${FOUND:-    none}
    No Developer ID? --unnotarized builds a DMG signed with Apple Development instead (docs/mac-release.md)."
  elif [ -n "$IDENTITY" ] && [[ "$IDENTITY" != *"($TEAM_ID)"* ]]; then
    problem "The Developer ID Application certificate \"$IDENTITY\" is not for team $TEAM_ID (the team in project.yml). Use a certificate from the right team, or set SLICE_SIGN_IDENTITY."
  fi
fi

# The notarytool keychain profile. "history" is the cheapest call that needs working credentials.
if [ "$UNNOTARIZED" = 0 ] && command -v xcrun >/dev/null 2>&1 && xcrun --find notarytool >/dev/null 2>&1; then
  if NOTARY_OUT="$(xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" 2>&1)"; then
    :
  elif grep -qi "no keychain password item\|could not find\|not found" <<<"$NOTARY_OUT"; then
    problem "No notarytool keychain profile called $NOTARY_PROFILE. Create it once with an app-specific password
    (appleid.apple.com > Sign-In and Security > App-Specific Passwords):
      xcrun notarytool store-credentials $NOTARY_PROFILE --apple-id YOU@EXAMPLE.COM --team-id $TEAM_ID --password abcd-efgh-ijkl-mnop"
  else
    problem "The notarytool profile $NOTARY_PROFILE exists but Apple did not accept it:
    $(head -n 3 <<<"$NOTARY_OUT" | tr '\n' ' ')
    Check your network, or store the credentials again (docs/mac-release.md)."
  fi
fi

# Which brain the build points at.
if [ -z "$BRAIN_URL" ]; then
  if [ "$ALLOW_LOCAL" = 1 ]; then
    echo "    No SLICE_BRAIN_URL: the app will look for a brain on 127.0.0.1:8000 (only useful on this Mac)."
  else
    problem "SLICE_BRAIN_URL is not set. Judges need an app that talks to your hosted brain, for example:
      SLICE_BRAIN_URL=wss://slice-brain-xxxx-uc.a.run.app/mac/live pnpm --filter @slice/mac release
    (apps/agent/scripts/deploy-cloud-run.sh prints the address. Use --allow-local-brain to build without one.)"
  fi
else
  case "$BRAIN_URL" in
    wss://*/mac/live) ;;
    ws://127.0.0.1*|ws://localhost*) [ "$ALLOW_LOCAL" = 1 ] || problem "SLICE_BRAIN_URL points at this Mac ($BRAIN_URL). Use the hosted address, or pass --allow-local-brain." ;;
    *) problem "SLICE_BRAIN_URL should look like wss://HOST/mac/live (secure WebSocket, ending in /mac/live). Got: $BRAIN_URL" ;;
  esac
  if [ -z "$BRAIN_TOKEN" ]; then
    echo "    No SLICE_BRAIN_TOKEN: judges will have to paste the token into Settings, Brain, Token."
  fi
fi

if [ "${#PROBLEMS[@]}" -gt 0 ]; then
  echo
  echo "Not ready to release (${#PROBLEMS[@]} thing(s) to fix):" >&2
  n=0
  for p in "${PROBLEMS[@]}"; do
    n=$((n + 1))
    printf '\n  %d. %s\n' "$n" "$p" >&2
  done
  echo >&2
  exit 1
fi

echo "    Signing identity: $IDENTITY"
if [ "$UNNOTARIZED" = 1 ]; then
  echo "    Notarization:     skipped (--unnotarized)"
else
  echo "    Notary profile:   $NOTARY_PROFILE"
fi
echo "    Brain address:    ${BRAIN_URL:-(local dev server)}"
if [ "$CHECK_ONLY" = 1 ]; then
  echo
  echo "Ready. Run without --check to build the DMG."
  exit 0
fi

# ---------------------------------------------------------------------------------------
# 2. Archive and export a Developer ID signed app (with --unnotarized, take it from the archive).
# ---------------------------------------------------------------------------------------
say "Starting clean in $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/logs"

say "Generating the Xcode project"
step xcodegen xcodegen generate --quiet

# Signed with Apple Development, Xcode would add get-task-allow (lets a debugger attach). The
# Developer ID export strips it; the unnotarized app is never exported, so leave it out here.
EXTRA_SETTINGS=()
if [ "$UNNOTARIZED" = 1 ]; then EXTRA_SETTINGS+=(CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO); fi

say "Archiving the Release build (a few minutes)"
step archive xcodebuild -project SliceMac.xcodeproj -scheme "$SCHEME" -configuration Release \
  -archivePath "$OUT/Slice.xcarchive" -derivedDataPath "$OUT/DerivedData" \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_IDENTITY="$IDENTITY" \
  SLICE_BRAIN_URL="$BRAIN_URL" SLICE_BRAIN_TOKEN="$BRAIN_TOKEN" \
  ${EXTRA_SETTINGS[@]+"${EXTRA_SETTINGS[@]}"} \
  archive

APP="$OUT/export/Slice.app"
if [ "$UNNOTARIZED" = 1 ]; then
  say "Taking Slice.app from the archive (Apple Development signed, not notarized)"
  mkdir -p "$OUT/export"
  ditto "$OUT/Slice.xcarchive/Products/Applications/Slice.app" "$APP"
else
  say "Exporting Slice.app signed with Developer ID"
  cat >"$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>developer-id</string>
	<key>teamID</key>
	<string>$TEAM_ID</string>
	<key>signingStyle</key>
	<string>manual</string>
	<key>signingCertificate</key>
	<string>$IDENTITY</string>
	<key>destination</key>
	<string>export</string>
</dict>
</plist>
PLIST
  plutil -lint "$OUT/ExportOptions.plist" >/dev/null
  step export xcodebuild -exportArchive -archivePath "$OUT/Slice.xcarchive" \
    -exportPath "$OUT/export" -exportOptionsPlist "$OUT/ExportOptions.plist"
fi

[ -d "$APP" ] || { echo "Export finished but $APP is missing; see $OUT/logs/export.log" >&2; exit 1; }

# The app must be hardened-runtime signed with our certificate and a secure timestamp, or notarization rejects it.
CODESIGN_INFO="$(codesign -dvv "$APP" 2>&1)"
grep -q "flags=.*runtime" <<<"$CODESIGN_INFO" || { echo "The exported app is not signed with the hardened runtime." >&2; exit 1; }
if [ "$UNNOTARIZED" = 1 ]; then
  grep -qxF "Authority=$IDENTITY" <<<"$CODESIGN_INFO" || { echo "The app is not signed with $IDENTITY." >&2; exit 1; }
else
  grep -q "Authority=Developer ID Application" <<<"$CODESIGN_INFO" || { echo "The exported app is not signed with a Developer ID Application certificate." >&2; exit 1; }
fi
grep -q "^Timestamp=" <<<"$CODESIGN_INFO" || { echo "The exported app has no secure timestamp." >&2; exit 1; }
codesign --verify --deep --strict "$APP"

# Judges may be on Apple silicon or Intel.
EXE="$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
ARCHS="$(lipo -archs "$EXE")"
if [[ " $ARCHS " != *" arm64 "* || " $ARCHS " != *" x86_64 "* ]]; then
  echo "The app is not a universal binary (it has: $ARCHS)." >&2
  exit 1
fi

PLIST_URL="$(/usr/libexec/PlistBuddy -c 'Print :SliceBrainURL' "$APP/Contents/Info.plist" 2>/dev/null || true)"
if [ "$PLIST_URL" != "$BRAIN_URL" ]; then
  echo "The built app's brain address ('$PLIST_URL') is not the requested one ('$BRAIN_URL')." >&2
  exit 1
fi
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Contents/Info.plist")"
echo "    Slice $VERSION ($BUILD), $ARCHS, brain ${PLIST_URL:-local}, token $([ -n "$BRAIN_TOKEN" ] && echo 'baked in' || echo 'not included')"

# Submit a file to Apple and wait; fail with Apple's own log if it is not accepted.
notarize() {
  local file="$1" name="$2" log="$OUT/logs/notarize-$2.log" id status
  # A rejected submission makes notarytool exit non-zero; the status check below explains it.
  { xcrun notarytool submit "$file" --keychain-profile "$NOTARY_PROFILE" --wait 2>&1 | tee "$log" | sed 's/^/    /'; } || true
  id="$(sed -n 's/^ *id: *//p' "$log" | head -n 1)"
  status="$(sed -n 's/^ *status: *//p' "$log" | tail -n 1)"
  if [ "$status" != "Accepted" ]; then
    echo "Apple did not accept $file (status: ${status:-unknown})." >&2
    if [ -n "$id" ]; then
      echo "Apple's report:" >&2
      xcrun notarytool log "$id" --keychain-profile "$NOTARY_PROFILE" 2>&1 | sed 's/^/    /' >&2 || true
    fi
    exit 1
  fi
}

# ---------------------------------------------------------------------------------------
# 3. Notarize and staple the app (not with --unnotarized).
# ---------------------------------------------------------------------------------------
if [ "$UNNOTARIZED" = 0 ]; then
  say "Notarizing Slice.app (Apple usually takes a few minutes)"
  ditto -c -k --keepParent "$APP" "$OUT/Slice-notarize.zip"
  notarize "$OUT/Slice-notarize.zip" app
  rm -f "$OUT/Slice-notarize.zip"

  say "Stapling the ticket to Slice.app"
  step staple-app xcrun stapler staple "$APP"
  xcrun stapler validate "$APP" | sed 's/^/    /'
fi

# ---------------------------------------------------------------------------------------
# 4. The DMG: the app next to an Applications shortcut.
# ---------------------------------------------------------------------------------------
DMG="$OUT/Slice-$VERSION.dmg"
say "Building $(basename "$DMG")"
STAGE="$OUT/dmg-root"
rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/Slice.app"
ln -s /Applications "$STAGE/Applications"
step dmg hdiutil create -volname "Slice" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"
rm -rf "$STAGE"

if [ "$UNNOTARIZED" = 1 ]; then
  # Left unsigned on purpose. Downloaded, a DMG signed with Apple Development (not notarized) is
  # refused when it is opened ("Not Opened", Done or Move to Trash), so people would need Open
  # Anyway twice. Unsigned, it mounts, and only the app inside (which is signed) needs it.
  say "Checking the DMG (unsigned; the app inside is signed)"
else
  say "Signing, notarizing and stapling the DMG"
  step sign-dmg codesign --force --sign "$IDENTITY" --timestamp "$DMG"
  notarize "$DMG" dmg
  step staple-dmg xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG" | sed 's/^/    /'
  step verify-dmg-signature codesign --verify --strict --verbose=2 "$DMG"
fi
step verify-dmg hdiutil verify "$DMG"

# ---------------------------------------------------------------------------------------
# 5. What Gatekeeper will say on a judge's Mac. An unnotarized build is rejected here by
#    design, so it skips this; the person opens it once with Open Anyway instead.
# ---------------------------------------------------------------------------------------
if [ "$UNNOTARIZED" = 0 ]; then
  say "Checking it the way Gatekeeper does"
  gatekeeper() {
    local out
    if ! out="$(spctl --assess --verbose=2 "$@" 2>&1)"; then
      echo "Gatekeeper would reject this:" >&2
      sed 's/^/    /' <<<"$out" >&2
      exit 1
    fi
    sed 's/^/    /' <<<"$out"
  }
  gatekeeper --type open --context context:primary-signature "$DMG"
  gatekeeper --type execute "$APP"
fi

SIZE="$(du -h "$DMG" | cut -f1)"
SHA="$(shasum -a 256 "$DMG" | cut -d' ' -f1)"
say "Done"
echo "    $DMG"
echo "    $SIZE, sha256 $SHA"
echo
if [ "$UNNOTARIZED" = 1 ]; then
  echo "Not notarized: on another Mac the first open is blocked. Open it once with System Settings >"
  echo "Privacy & Security > Open Anyway (docs/mac-release.md, \"Unnotarized build\")."
fi
echo "Send judges that file. Open the folder with:  open \"$OUT\""
