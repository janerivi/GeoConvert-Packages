#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
project="$repository_root/packages/csharp/Placeframe.GeoConvert/Tests/DotNet/Placeframe.GeoConvert.Smoke.csproj"

if command -v dotnet >/dev/null 2>&1; then
  dotnet run --project "$project" --configuration Release
  exit 0
fi

unity_root=${UNITY_EDITOR_ROOT:-/Applications/Unity/Hub/Editor/2022.3.18f1/Unity.app/Contents}
mono="$unity_root/MonoBleedingEdge/bin/mono"
csc="$unity_root/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe"
if [ ! -x "$mono" ] || [ ! -f "$csc" ]; then
  echo "dotnet or a Unity 2022.3 compiler is required" >&2
  exit 1
fi

output_directory=$(mktemp -d /tmp/geoconvert-csharp.XXXXXX)
trap 'rm -rf "$output_directory"' EXIT INT TERM

"$mono" "$csc" \
  -nologo \
  -warnaserror+ \
  -langversion:9.0 \
  -target:exe \
  -out:"$output_directory/GeoConvertSmoke.exe" \
  "$repository_root/packages/csharp/Placeframe.GeoConvert/Runtime/GeoConvert.cs" \
  "$repository_root/packages/csharp/Placeframe.GeoConvert/Runtime/GeoPose.cs" \
  "$repository_root/packages/csharp/Placeframe.GeoConvert/Tests/DotNet/Program.cs"
"$mono" "$output_directory/GeoConvertSmoke.exe"
