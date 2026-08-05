#!/usr/bin/env bash
# Regenerate public/exercises.json from the upstream dataset.
# Source: hasaneyldrm/exercises-dataset (MIT for data; media © Gym visual).
# Slims the 17 MB / 10-language upstream to English-only fields we use (~967 KB).
set -euo pipefail

SRC="https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json"
OUT="$(dirname "$0")/../public/exercises.json"

curl -sL "$SRC" | jq -c '[.[] | {
  id, name, category,
  bodyPart: .body_part,
  equipment,
  target,
  secondary: .secondary_muscles,
  muscleGroup: .muscle_group,
  image, gif: .gif_url,
  steps: (.instruction_steps.en // [])
}]' > "$OUT"

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1), $(jq length "$OUT") exercises)"
