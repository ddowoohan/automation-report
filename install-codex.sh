#!/bin/bash
# Codex 확장 설치 스크립트
# 터미널에서 실행: ./install-codex.sh

CURSOR_CLI="/Applications/Cursor.app/Contents/Resources/app/bin/cursor"

if [ -f "$CURSOR_CLI" ]; then
  echo "Codex(ChatGPT) 확장 설치 중..."
  "$CURSOR_CLI" --install-extension openai.chatgpt
  echo "완료! Cursor를 재시작하고 왼쪽 사이드바에서 Codex 아이콘을 확인하세요."
else
  echo "Cursor를 찾을 수 없습니다. 수동 설치 방법:"
  echo "1. Cursor에서 Cmd+Shift+X (확장 탭)"
  echo "2. 'ChatGPT' 또는 'Codex' 검색"
  echo "3. 설치 후 재시작"
fi
