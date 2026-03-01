#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Abriendo TaxPy Trainer en http://localhost:8000 ..."
python3 -m http.server 8000 >/dev/null 2>&1 &
PID=$!
sleep 1
if command -v open >/dev/null 2>&1; then
  open "http://localhost:8000/"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:8000/"
else
  echo "Abre tu navegador en: http://localhost:8000/"
fi
wait $PID
