#!/bin/bash
# macOS 26(Tahoe)에서 Electron 앱이 EXC_BREAKPOINT로 즉시 크래시하는 문제 대응.
# 원인: 유료 Apple Developer 인증서 없이 ad-hoc 서명만 하면 entitlements(JIT/unsigned-executable-memory 등)가
# 하나도 안 붙는데, macOS 26의 강화된 V8 메모리 보호 정책이 이걸 요구해서 런타임에 SIGTRAP으로 죽는다.
# 이 스크립트는 electron-builder가 만든 --dir 결과물에 entitlements + hardened runtime을 얹어 ad-hoc 재서명한다.
# 안쪽(헬퍼/프레임워크)부터 바깥쪽(최상위 .app) 순서로 서명해야 한다 - 반대로 하면 서명이 깨진다.
set -euo pipefail

APP="$1"
ENT="$(dirname "$0")/../build/entitlements.mac.plist"

if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  echo "사용법: $0 <path-to-.app>"
  exit 1
fi

sign() {
  codesign --force --sign - --entitlements "$ENT" --options runtime "$1"
}

echo "[1/5] crashpad_handler"
sign "$APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler"

echo "[2/5] 서브 프레임워크"
for fw in Squirrel Mantle ReactiveObjC; do
  codesign --force --sign - "$APP/Contents/Frameworks/$fw.framework"
done

echo "[3/5] Electron Framework"
sign "$APP/Contents/Frameworks/Electron Framework.framework"

echo "[4/5] Helper 앱들"
for helper in "$APP/Contents/Frameworks/"*.app; do
  sign "$helper"
done

echo "[5/5] 최상위 앱"
sign "$APP"

echo "완료. 검증:"
codesign -dv "$APP"
