# Static file server for local preview.
#   powershell -File tools/serve.ps1
# Then open http://localhost:8087/
#
# A server is needed rather than opening index.html directly, because browsers
# block the panorama texture from loading over file://

$root = Split-Path -Parent $PSScriptRoot
$port = 8087

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
  ".json" = "application/json"
  ".webp" = "image/webp"
  ".md"   = "text/markdown; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Output "Serving $root"
Write-Output "  http://localhost:$port/    (Ctrl+C to stop)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
    $path = Join-Path $root ($rel -replace '/', '\')

    $full = $null
    try { $full = [System.IO.Path]::GetFullPath($path) } catch { }

    if ($full -and $full.StartsWith([System.IO.Path]::GetFullPath($root)) -and (Test-Path $full -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $type = $mime[$ext]
      if (-not $type) { $type = "application/octet-stream" }
      $ctx.Response.ContentType = $type
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 $rel")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      Write-Output "404 $rel"
    }
    $ctx.Response.OutputStream.Close()
  } catch {
    Write-Output "ERR $($_.Exception.Message)"
  }
}
