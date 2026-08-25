# Traces the coastline of Mauritius out of a raster outline map and prints an
# SVG path.
#
#   powershell -File tools/trace-coastline.ps1 -Source "C:\path\to\map.png"
#
# Why: the supplied map is a PNG, so there is no path data to lift. Rather than
# redrawing the island by hand, this reads the pixels and follows the outer
# boundary, which gives a genuine coastline rather than an impression.
#
# Only the OUTER contour is traced, so the district lines inside the island are
# ignored automatically — which is what "outline only" needs.

param(
  [string]$Source = "$env:USERPROFILE\Downloads\pngegg(2).png",
  [int]$ViewW = 1000,          # width of the emitted viewBox
  [double]$Tolerance = 1.6     # Douglas-Peucker tolerance, in source pixels
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Source)) { Write-Error "Not found: $Source"; exit 1 }

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;

public static class Coast
{
    // Ink = dark and opaque. Background may be white or transparent; both fail
    // this test, so either kind of source works.
    static bool IsInk(int argb)
    {
        int a = (argb >> 24) & 0xFF;
        if (a < 128) return false;
        int r = (argb >> 16) & 0xFF, g = (argb >> 8) & 0xFF, b = argb & 0xFF;
        return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    }

    // Everything reachable from the border without crossing ink is "sea".
    // The island is then everything else: the coastline stroke plus the land
    // it encloses, district lines included.
    public static bool[] Land(int[] px, int w, int h)
    {
        bool[] sea = new bool[w * h];
        Stack<int> st = new Stack<int>();

        for (int x = 0; x < w; x++) {
            if (!IsInk(px[x])) { sea[x] = true; st.Push(x); }
            int i = (h - 1) * w + x;
            if (!IsInk(px[i])) { sea[i] = true; st.Push(i); }
        }
        for (int y = 0; y < h; y++) {
            int i = y * w;
            if (!IsInk(px[i])) { sea[i] = true; st.Push(i); }
            int j = y * w + (w - 1);
            if (!IsInk(px[j])) { sea[j] = true; st.Push(j); }
        }

        int[] dx = { 1, -1, 0, 0 };
        int[] dy = { 0, 0, 1, -1 };
        while (st.Count > 0) {
            int i = st.Pop();
            int x = i % w, y = i / w;
            for (int k = 0; k < 4; k++) {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                int ni = ny * w + nx;
                if (sea[ni] || IsInk(px[ni])) continue;
                sea[ni] = true;
                st.Push(ni);
            }
        }

        bool[] land = new bool[w * h];
        for (int i = 0; i < land.Length; i++) land[i] = !sea[i];
        return land;
    }

    // Moore-neighbour boundary tracing with Jacob's stopping criterion.
    public static List<int[]> Trace(bool[] land, int w, int h)
    {
        int start = -1;
        for (int i = 0; i < land.Length; i++) if (land[i]) { start = i; break; }
        var pts = new List<int[]>();
        if (start < 0) return pts;

        int[] nx = { -1, 0, 1, 1, 1, 0, -1, -1 };
        int[] ny = { -1, -1, -1, 0, 1, 1, 1, 0 };

        int cx = start % w, cy = start / w;
        int bx = cx - 1, by = cy;              // came from the west
        int sx = cx, sy = cy, sbx = bx, sby = by;
        int guard = w * h * 4;

        do {
            pts.Add(new int[] { cx, cy });

            int dir = 0;
            for (int k = 0; k < 8; k++)
                if (cx + nx[k] == bx && cy + ny[k] == by) { dir = k; break; }

            bool moved = false;
            for (int s = 1; s <= 8; s++) {
                int k = (dir + s) % 8;
                int px2 = cx + nx[k], py2 = cy + ny[k];
                if (px2 < 0 || py2 < 0 || px2 >= w || py2 >= h) continue;
                if (land[py2 * w + px2]) {
                    bx = cx + nx[(k + 7) % 8];
                    by = cy + ny[(k + 7) % 8];
                    cx = px2; cy = py2;
                    moved = true;
                    break;
                }
            }
            if (!moved) break;
            if (--guard <= 0) break;
        } while (!(cx == sx && cy == sy && bx == sbx && by == sby));

        return pts;
    }

    // Douglas-Peucker, iterative so a long contour cannot blow the stack.
    public static List<int[]> Simplify(List<int[]> pts, double tol)
    {
        int n = pts.Count;
        if (n < 3) return pts;
        bool[] keep = new bool[n];
        keep[0] = true; keep[n - 1] = true;

        var stack = new Stack<int[]>();
        stack.Push(new int[] { 0, n - 1 });

        while (stack.Count > 0) {
            int[] seg = stack.Pop();
            int a = seg[0], b = seg[1];
            double ax = pts[a][0], ay = pts[a][1];
            double bx2 = pts[b][0], by2 = pts[b][1];
            double dx = bx2 - ax, dy = by2 - ay;
            double len = Math.Sqrt(dx * dx + dy * dy);

            double worst = -1; int idx = -1;
            for (int i = a + 1; i < b; i++) {
                double px2 = pts[i][0], py2 = pts[i][1];
                double d = (len == 0)
                    ? Math.Sqrt((px2 - ax) * (px2 - ax) + (py2 - ay) * (py2 - ay))
                    : Math.Abs(dy * px2 - dx * py2 + bx2 * ay - by2 * ax) / len;
                if (d > worst) { worst = d; idx = i; }
            }
            if (worst > tol && idx > 0) {
                keep[idx] = true;
                stack.Push(new int[] { a, idx });
                stack.Push(new int[] { idx, b });
            }
        }

        var outp = new List<int[]>();
        for (int i = 0; i < n; i++) if (keep[i]) outp.Add(pts[i]);
        return outp;
    }
}
"@ -ReferencedAssemblies System.Drawing

$bmp = New-Object System.Drawing.Bitmap $Source
$w = $bmp.Width; $h = $bmp.Height
Write-Output "Source: $([System.IO.Path]::GetFileName($Source))  ${w}x${h}"

$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                      [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$px = New-Object int[] ($w * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $px, 0, $px.Length)
$bmp.UnlockBits($data); $bmp.Dispose()

$land = [Coast]::Land($px, $w, $h)
$raw  = [Coast]::Trace($land, $w, $h)
Write-Output "Traced $($raw.Count) boundary points"

$simple = [Coast]::Simplify($raw, $Tolerance)
Write-Output "Simplified to $($simple.Count) points (tolerance $Tolerance px)"

# Normalise into the viewBox, preserving aspect.
$minX = ($simple | ForEach-Object { $_[0] } | Measure-Object -Minimum).Minimum
$maxX = ($simple | ForEach-Object { $_[0] } | Measure-Object -Maximum).Maximum
$minY = ($simple | ForEach-Object { $_[1] } | Measure-Object -Minimum).Minimum
$maxY = ($simple | ForEach-Object { $_[1] } | Measure-Object -Maximum).Maximum

$spanX = $maxX - $minX; $spanY = $maxY - $minY
$scale = $ViewW / $spanX
$viewH = [Math]::Round($spanY * $scale)

Write-Output "Source bbox ${spanX}x${spanY}  ->  viewBox 0 0 $ViewW $viewH  (aspect $([Math]::Round($spanY/$spanX,3)))"

$sb = New-Object System.Text.StringBuilder
for ($i = 0; $i -lt $simple.Count; $i++) {
  $x = [Math]::Round(($simple[$i][0] - $minX) * $scale, 1)
  $y = [Math]::Round(($simple[$i][1] - $minY) * $scale, 1)
  if ($i -eq 0) { [void]$sb.Append("M$x $y") } else { [void]$sb.Append("L$x $y") }
}
[void]$sb.Append("Z")

Write-Output ""
Write-Output "--- path ---"
$sb.ToString()
