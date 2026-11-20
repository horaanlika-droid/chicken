#!/usr/bin/env sh
set -eu
if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 input.webm [output.mp4]" >&2
  exit 2
fi
input=$1
output=${2:-"${input%.*}.mp4"}
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to transcode WebM to MP4." >&2
  exit 1
fi
ffmpeg -hide_banner -y -i "$input" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$output"
