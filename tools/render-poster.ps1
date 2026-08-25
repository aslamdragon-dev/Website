# Renders the splash still frame from the equirectangular panorama, framed to
# exactly match the tour's opening view.
#
#   powershell -File tools/render-poster.ps1
#
# Why this exists: the splash background has to line up pixel-for-pixel with the
# live 360 that takes over behind it, or the handover shows a jump. A plain crop
# of the equirect image will not do — it needs a proper rectilinear reprojection
# using the same camera the tour opens with.
#
# Marzipano's `fov` is the VERTICAL field of view (verified against
# coordinatesToScreen: focal = (height/2) / tan(fov/2)).
#
# Keep POSTER_FOV in step with SPLASH_FOV in assets/js/tour.js.

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root "assets\img\pano-aerial-4096.jpg"
$dst  = Join-Path $root "assets\img\pano-poster-1600.jpg"

# Must match SPLASH_FOV / the opening yaw and pitch in assets/js/tour.js
$YAW    = -0.033
$PITCH  = 0.24
$FOV    = 1.60      # vertical, radians — the wide framing the splash sits at
$OUT_W  = 1600
$OUT_H  = 900
$QUALITY = 86

if (-not (Test-Path $src)) { Write-Error "Panorama not found: $src`nRun tools/resize-images.ps1 first."; exit 1 }

Add-Type -TypeDefinition @"
using System;

public static class Reproject
{
    // Equirectangular -> rectilinear (gnomonic) projection with bilinear sampling.
    public static int[] Render(int[] src, int srcW, int srcH,
                               int dstW, int dstH,
                               double yaw, double pitch, double vfov)
    {
        int[] dst = new int[dstW * dstH];

        // Marzipano's fov is vertical, so the focal length comes off the height.
        double focal = (dstH / 2.0) / Math.Tan(vfov / 2.0);

        double cp = Math.Cos(pitch), sp = Math.Sin(pitch);
        double cy = Math.Cos(yaw),   sy = Math.Sin(yaw);

        double twoPi = Math.PI * 2.0;

        for (int py = 0; py < dstH; py++)
        {
            double y = py - dstH / 2.0 + 0.5;

            for (int px = 0; px < dstW; px++)
            {
                double x = px - dstW / 2.0 + 0.5;
                double z = focal;

                // Rotate about X by pitch (y points down, z forward).
                double yw = y * cp + z * sp;
                double zw = -y * sp + z * cp;
                double xw = x;

                // Rotate about the vertical axis by yaw.
                double xf = xw * cy + zw * sy;
                double zf = -xw * sy + zw * cy;
                double yf = yw;

                double len = Math.Sqrt(xf * xf + yf * yf + zf * zf);
                double lon = Math.Atan2(xf, zf);
                double lat = Math.Asin(yf / len);

                // Equirect sample position.
                double u = (lon / twoPi + 0.5) * srcW - 0.5;
                double v = (lat / Math.PI + 0.5) * srcH - 0.5;

                int u0 = (int)Math.Floor(u);
                int v0 = (int)Math.Floor(v);
                double fu = u - u0;
                double fv = v - v0;

                int u1 = u0 + 1;
                int v1 = v0 + 1;

                // Longitude wraps; latitude clamps.
                u0 = ((u0 % srcW) + srcW) % srcW;
                u1 = ((u1 % srcW) + srcW) % srcW;
                if (v0 < 0) v0 = 0; else if (v0 > srcH - 1) v0 = srcH - 1;
                if (v1 < 0) v1 = 0; else if (v1 > srcH - 1) v1 = srcH - 1;

                int c00 = src[v0 * srcW + u0];
                int c10 = src[v0 * srcW + u1];
                int c01 = src[v1 * srcW + u0];
                int c11 = src[v1 * srcW + u1];

                int r = Lerp2(( c00 >> 16) & 0xFF, (c10 >> 16) & 0xFF, (c01 >> 16) & 0xFF, (c11 >> 16) & 0xFF, fu, fv);
                int g = Lerp2(( c00 >>  8) & 0xFF, (c10 >>  8) & 0xFF, (c01 >>  8) & 0xFF, (c11 >>  8) & 0xFF, fu, fv);
                int b = Lerp2(( c00       ) & 0xFF, (c10       ) & 0xFF, (c01       ) & 0xFF, (c11       ) & 0xFF, fu, fv);

                dst[py * dstW + px] = unchecked((int)0xFF000000) | (r << 16) | (g << 8) | b;
            }
        }
        return dst;
    }

    private static int Lerp2(int a, int b, int c, int d, double fu, double fv)
    {
        double top = a + (b - a) * fu;
        double bot = c + (d - c) * fu;
        double val = top + (bot - top) * fv;
        int i = (int)(val + 0.5);
        return i < 0 ? 0 : (i > 255 ? 255 : i);
    }
}
"@ -ReferencedAssemblies System.Drawing

Write-Output "Reading $([System.IO.Path]::GetFileName($src)) ..."
$srcBmp = New-Object System.Drawing.Bitmap $src
$srcW = $srcBmp.Width; $srcH = $srcBmp.Height

$rect = New-Object System.Drawing.Rectangle 0, 0, $srcW, $srcH
$srcData = $srcBmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$srcPixels = New-Object int[] ($srcW * $srcH)
[System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $srcPixels, 0, $srcPixels.Length)
$srcBmp.UnlockBits($srcData)

Write-Output "Reprojecting to ${OUT_W}x${OUT_H} at yaw $YAW, pitch $PITCH, vfov $FOV ..."
$dstPixels = [Reproject]::Render($srcPixels, $srcW, $srcH, $OUT_W, $OUT_H, $YAW, $PITCH, $FOV)

$dstBmp = New-Object System.Drawing.Bitmap $OUT_W, $OUT_H,
          ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$dstRect = New-Object System.Drawing.Rectangle 0, 0, $OUT_W, $OUT_H
$dstData = $dstBmp.LockBits($dstRect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly,
                            [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
[System.Runtime.InteropServices.Marshal]::Copy($dstPixels, 0, $dstData.Scan0, $dstPixels.Length)
$dstBmp.UnlockBits($dstData)

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
         Where-Object { $_.MimeType -eq 'image/jpeg' }
$eps = New-Object System.Drawing.Imaging.EncoderParameters 1
$eps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [long]$QUALITY)
$dstBmp.Save($dst, $codec, $eps)

$eps.Dispose(); $dstBmp.Dispose(); $srcBmp.Dispose()

"{0} {1} x {2}  {3} KB" -f [System.IO.Path]::GetFileName($dst), $OUT_W, $OUT_H, [int]((Get-Item $dst).Length / 1KB)
