# Regenerates everything in assets/img from the drone originals.
#   powershell -File tools/resize-images.ps1
#
# Uses .NET imaging rather than ImageMagick or Pillow, because this machine has
# neither Node nor a real Python install (python.exe on PATH is a Store stub,
# and convert.exe is Windows' filesystem tool, not ImageMagick).

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path (Split-Path -Parent $root) "Incoming\2026-08-21_Drone\POB_AERIAL_FINAL"
$out  = Join-Path $root "assets\img"

if (-not (Test-Path $src)) { Write-Error "Source folder not found: $src"; exit 1 }
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Force $out | Out-Null }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
         Where-Object { $_.MimeType -eq 'image/jpeg' }

function Save-Jpeg($bmp, $dstPath, $quality) {
    $eps = New-Object System.Drawing.Imaging.EncoderParameters 1
    $eps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
        [System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
    $bmp.Save($dstPath, $codec, $eps)
    $eps.Dispose()
}

function New-Canvas($w, $h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $bmp.SetResolution(72, 72)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    return @{ bmp = $bmp; g = $g }
}

function Resize-Jpeg($srcPath, $dstPath, $targetW, $quality) {
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $w = $targetW
    $h = [int][Math]::Round($img.Height * $targetW / $img.Width)
    $c = New-Canvas $w $h
    $c.g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h))
    Save-Jpeg $c.bmp $dstPath $quality
    $c.g.Dispose(); $c.bmp.Dispose(); $img.Dispose()
    "{0,-28} {1,5} x {2,-5} {3,6} KB" -f (Split-Path $dstPath -Leaf), $w, $h, [int]((Get-Item $dstPath).Length / 1KB)
}

# --- Flat photography -------------------------------------------------------
# Only what the page actually uses. The commented entries are other drone shots
# that are available — uncomment one to generate it, then place it in index.html.
$jobs = @(
    @{ s = "POB_NORTHSIDE_CLOSEUP_V01"; d = "plots-serviced"; widths = @(1600, 900) },
    @{ s = "AERIAL_V01_HALFSIZE";       d = "site-plan";      widths = @(1200, 700) }
    # @{ s = "POB_NORTHSIDE_V01"; d = "coast-hero"; widths = @(2400, 1400, 800) }  # coast + lagoon, wide
    # @{ s = "POB_WESTSIDE_V01";  d = "site-west";  widths = @(1600, 900)       }  # estate from the west
    # @{ s = "POB_EASTSIDE_V01";  d = "site-east";  widths = @(1600, 900)       }  # estate from the east
)

foreach ($j in $jobs) {
    foreach ($w in $j.widths) {
        $q = if ($w -ge 2000) { 78 } elseif ($w -ge 1200) { 82 } else { 85 }
        Resize-Jpeg "$src\$($j.s).jpg" "$out\$($j.d)-$w.jpg" $w $q
    }
}

# --- Equirectangular panorama for the 360 tour ------------------------------
# 4096 wide is the safe single-texture ceiling for mobile GPUs; 2048 is the
# low-bandwidth fallback served to phones.
$pano = "$src\360_V01.jpg"
Resize-Jpeg $pano "$out\pano-aerial-4096.jpg" 4096 84
Resize-Jpeg $pano "$out\pano-aerial-2048.jpg" 2048 84

# --- Poster still -----------------------------------------------------------
# A 16:9 crop from the panorama's centre, shown behind the opening fade and used
# as the fallback wherever WebGL is unavailable.
$img = [System.Drawing.Image]::FromFile($pano)
$cropW = [int]($img.Width / 3.2)
$cropH = [int]($cropW * 9 / 16)
$cropX = [int](($img.Width - $cropW) / 2)
$cropY = [int]($img.Height * 0.40)
$c = New-Canvas 1600 900
$c.g.DrawImage($img,
  (New-Object System.Drawing.Rectangle 0, 0, 1600, 900),
  (New-Object System.Drawing.Rectangle $cropX, $cropY, $cropW, $cropH),
  [System.Drawing.GraphicsUnit]::Pixel)
Save-Jpeg $c.bmp "$out\pano-poster-1600.jpg" 84
$c.g.Dispose(); $c.bmp.Dispose(); $img.Dispose()
"{0,-28} {1,5} x {2,-5} {3,6} KB" -f "pano-poster-1600.jpg", 1600, 900, [int]((Get-Item "$out\pano-poster-1600.jpg").Length / 1KB)
