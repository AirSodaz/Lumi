#requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateSet("auto", "windows-x64", "windows-arm64", "macos-x64", "macos-arm64", "linux-x64", "linux-arm64")]
    [string] $Platform = "auto",

    [string] $Manifest = (Join-Path $PSScriptRoot "libmpv-sources.json"),

    [string] $OutputDir = (Join-Path (Split-Path $PSScriptRoot -Parent) "src-tauri/resources/libmpv")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$KnownArchiveTypes = @("zip", "7z", "tar.gz", "tar.xz")

function Resolve-AbsolutePath {
    param([Parameter(Mandatory = $true)][string] $Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
}

function Resolve-LibmpvPlatform {
    param([Parameter(Mandatory = $true)][string] $RequestedPlatform)

    if ($RequestedPlatform -ne "auto") {
        return $RequestedPlatform
    }

    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    $archName = switch ($arch) {
        "X64" { "x64" }
        "Arm64" { "arm64" }
        default { throw "Unsupported CPU architecture for libmpv bundle staging: $arch" }
    }

    if ($IsWindows) {
        return "windows-$archName"
    }
    if ($IsMacOS) {
        return "macos-$archName"
    }
    if ($IsLinux) {
        return "linux-$archName"
    }

    throw "Unsupported OS for libmpv bundle staging."
}

function Get-RequiredString {
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Source,
        [Parameter(Mandatory = $true)] [string] $Name,
        [Parameter(Mandatory = $true)] [string] $PlatformName
    )

    if (-not $Source.ContainsKey($Name)) {
        throw "libmpv source '$PlatformName' is missing required field '$Name'."
    }

    $value = [string] $Source[$Name]
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "libmpv source '$PlatformName' has an empty required field '$Name'."
    }

    return $value
}

function Get-RequiredStringArray {
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Source,
        [Parameter(Mandatory = $true)] [string] $Name,
        [Parameter(Mandatory = $true)] [string] $PlatformName
    )

    if (-not $Source.ContainsKey($Name)) {
        throw "libmpv source '$PlatformName' is missing required field '$Name'."
    }

    $raw = $Source[$Name]
    $values = @()
    if ($raw -is [System.Collections.IEnumerable] -and $raw -isnot [string]) {
        foreach ($item in $raw) {
            $values += [string] $item
        }
    } else {
        $values += [string] $raw
    }

    $values = @($values | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($values.Count -eq 0) {
        throw "libmpv source '$PlatformName' must provide at least one '$Name' entry."
    }

    return $values
}

function Read-LibmpvSource {
    param(
        [Parameter(Mandatory = $true)] [string] $ManifestPath,
        [Parameter(Mandatory = $true)] [string] $PlatformName
    )

    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        throw "libmpv source manifest not found: $ManifestPath"
    }

    $manifestData = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json -AsHashtable
    if (-not $manifestData.ContainsKey("sources")) {
        throw "libmpv source manifest must contain a 'sources' object."
    }

    $sources = $manifestData["sources"]
    if (-not ($sources -is [hashtable])) {
        throw "libmpv source manifest field 'sources' must be an object."
    }

    if (-not $sources.ContainsKey($PlatformName)) {
        throw "No audited libmpv source configured for platform '$PlatformName' in $ManifestPath. Add a pinned source with url, sha256, archiveType, license, licenseUrl, sourceName, sourceUrl, mainLibraries, and copyGlobs."
    }

    $source = $sources[$PlatformName]
    if (-not ($source -is [hashtable])) {
        throw "libmpv source '$PlatformName' must be an object."
    }

    if ($source.ContainsKey("enabled") -and -not [bool] $source["enabled"]) {
        throw "libmpv source '$PlatformName' is present but disabled in $ManifestPath."
    }

    $url = Get-RequiredString $source "url" $PlatformName
    $sha256 = (Get-RequiredString $source "sha256" $PlatformName).ToLowerInvariant()
    $archiveType = (Get-RequiredString $source "archiveType" $PlatformName).ToLowerInvariant()
    $license = Get-RequiredString $source "license" $PlatformName
    $licenseUrl = Get-RequiredString $source "licenseUrl" $PlatformName
    $sourceName = Get-RequiredString $source "sourceName" $PlatformName
    $sourceUrl = Get-RequiredString $source "sourceUrl" $PlatformName
    $mainLibraries = Get-RequiredStringArray $source "mainLibraries" $PlatformName
    $copyGlobs = Get-RequiredStringArray $source "copyGlobs" $PlatformName

    if ($sha256 -notmatch "^[0-9a-f]{64}$") {
        throw "libmpv source '$PlatformName' has invalid sha256 '$sha256'."
    }
    if ($KnownArchiveTypes -notcontains $archiveType) {
        throw "libmpv source '$PlatformName' has unsupported archiveType '$archiveType'. Supported values: $($KnownArchiveTypes -join ', ')."
    }
    if ($license -notmatch "LGPL") {
        throw "libmpv source '$PlatformName' must explicitly identify an LGPL-compatible libmpv build."
    }

    $extractSubdir = ""
    if ($source.ContainsKey("extractSubdir")) {
        $extractSubdir = [string] $source["extractSubdir"]
        if ($extractSubdir.Contains("..")) {
            throw "libmpv source '$PlatformName' has unsafe extractSubdir '$extractSubdir'."
        }
    }

    return [ordered]@{
        Url = $url
        Sha256 = $sha256
        ArchiveType = $archiveType
        License = $license
        LicenseUrl = $licenseUrl
        SourceName = $sourceName
        SourceUrl = $sourceUrl
        MainLibraries = $mainLibraries
        CopyGlobs = $copyGlobs
        ExtractSubdir = $extractSubdir
    }
}

function Copy-Or-DownloadArchive {
    param(
        [Parameter(Mandatory = $true)] [string] $Url,
        [Parameter(Mandatory = $true)] [string] $Destination
    )

    if ($Url -match "^https?://") {
        Invoke-WebRequest -Uri $Url -OutFile $Destination
        return
    }

    $localPath = $Url
    if ($Url -match "^file://") {
        $localPath = ([System.Uri] $Url).LocalPath
    }
    $localPath = Resolve-AbsolutePath $localPath

    if (-not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
        throw "Local libmpv archive source not found: $localPath"
    }

    Copy-Item -LiteralPath $localPath -Destination $Destination
}

function Expand-LibmpvArchive {
    param(
        [Parameter(Mandatory = $true)] [string] $ArchivePath,
        [Parameter(Mandatory = $true)] [string] $ArchiveType,
        [Parameter(Mandatory = $true)] [string] $Destination
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    switch ($ArchiveType) {
        "zip" {
            Expand-Archive -LiteralPath $ArchivePath -DestinationPath $Destination -Force
        }
        "7z" {
            $sevenZip = Get-Command 7z, 7za, 7zr -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($null -eq $sevenZip) {
                throw "archiveType '7z' requires 7z, 7za, or 7zr on PATH."
            }
            & $sevenZip.Source x "-o$Destination" -y $ArchivePath | Out-Host
            if ($LASTEXITCODE -ne 0) {
                throw "7z extraction failed with exit code $LASTEXITCODE."
            }
        }
        "tar.gz" {
            & tar -xzf $ArchivePath -C $Destination
            if ($LASTEXITCODE -ne 0) {
                throw "tar.gz extraction failed with exit code $LASTEXITCODE."
            }
        }
        "tar.xz" {
            & tar -xJf $ArchivePath -C $Destination
            if ($LASTEXITCODE -ne 0) {
                throw "tar.xz extraction failed with exit code $LASTEXITCODE."
            }
        }
    }
}

function Test-RelativePathMatchesGlob {
    param(
        [Parameter(Mandatory = $true)] [string] $RelativePath,
        [Parameter(Mandatory = $true)] [string] $Pattern
    )

    $normalizedPath = $RelativePath.Replace("\", "/")
    $patterns = @($Pattern.Replace("\", "/"))
    if ($patterns[0].StartsWith("**/")) {
        $patterns += $patterns[0].Substring(3)
    }

    foreach ($effectivePattern in $patterns) {
        $wildcard = [System.Management.Automation.WildcardPattern]::new(
            $effectivePattern,
            [System.Management.Automation.WildcardOptions]::IgnoreCase
        )
        if ($wildcard.IsMatch($normalizedPath)) {
            return $true
        }
    }

    return $false
}

function Get-MatchedArchiveFiles {
    param(
        [Parameter(Mandatory = $true)] [string] $SearchRoot,
        [Parameter(Mandatory = $true)] [string[]] $Patterns
    )

    if (-not (Test-Path -LiteralPath $SearchRoot -PathType Container)) {
        throw "Extracted libmpv search root not found: $SearchRoot"
    }

    $matches = @()
    foreach ($file in Get-ChildItem -LiteralPath $SearchRoot -Recurse -File) {
        $relative = [System.IO.Path]::GetRelativePath($SearchRoot, $file.FullName)
        foreach ($pattern in $Patterns) {
            if (Test-RelativePathMatchesGlob $relative $pattern) {
                $matches += $file
                break
            }
        }
    }

    return $matches
}

function Reset-PlatformOutputDirectory {
    param(
        [Parameter(Mandatory = $true)] [string] $OutputRoot,
        [Parameter(Mandatory = $true)] [string] $PlatformName
    )

    $platformDir = [System.IO.Path]::GetFullPath((Join-Path $OutputRoot $PlatformName))
    $rootWithSeparator = ([System.IO.Path]::GetFullPath($OutputRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar)

    if (-not $platformDir.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean unexpected libmpv output directory: $platformDir"
    }

    if (Test-Path -LiteralPath $platformDir) {
        Remove-Item -LiteralPath $platformDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $platformDir | Out-Null

    return $platformDir
}

$resolvedPlatform = Resolve-LibmpvPlatform $Platform
$manifestPath = Resolve-AbsolutePath $Manifest
$outputRoot = Resolve-AbsolutePath $OutputDir
$source = Read-LibmpvSource $manifestPath $resolvedPlatform

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "lumi-libmpv-$resolvedPlatform-$([System.Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
    $archivePath = Join-Path $tempRoot "source.$($source.ArchiveType.Replace('.', '-'))"
    Copy-Or-DownloadArchive $source.Url $archivePath

    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
    if ($actualHash -ne $source.Sha256) {
        throw "SHA256 mismatch for libmpv source '$resolvedPlatform'. Expected $($source.Sha256), got $actualHash."
    }

    $extractRoot = Join-Path $tempRoot "extract"
    Expand-LibmpvArchive $archivePath $source.ArchiveType $extractRoot

    $searchRoot = $extractRoot
    if (-not [string]::IsNullOrWhiteSpace($source.ExtractSubdir)) {
        $searchRoot = Join-Path $extractRoot $source.ExtractSubdir
    }

    $matchedFiles = @(Get-MatchedArchiveFiles $searchRoot $source.CopyGlobs)
    if ($matchedFiles.Count -eq 0) {
        throw "No files matched copyGlobs for libmpv source '$resolvedPlatform'."
    }

    $platformDir = Reset-PlatformOutputDirectory $outputRoot $resolvedPlatform
    $copiedNames = @()
    foreach ($file in $matchedFiles) {
        $destination = Join-Path $platformDir $file.Name
        if (Test-Path -LiteralPath $destination) {
            throw "Refusing to overwrite duplicate staged libmpv file '$($file.Name)' from '$($file.FullName)'."
        }
        Copy-Item -LiteralPath $file.FullName -Destination $destination
        $copiedNames += $file.Name
    }

    foreach ($libraryName in $source.MainLibraries) {
        if (-not (Test-Path -LiteralPath (Join-Path $platformDir $libraryName) -PathType Leaf)) {
            throw "Required libmpv main library '$libraryName' was not staged for '$resolvedPlatform'."
        }
    }

    $metadata = [ordered]@{
        platform = $resolvedPlatform
        sourceName = $source.SourceName
        sourceUrl = $source.SourceUrl
        archiveUrl = $source.Url
        sha256 = $source.Sha256
        license = $source.License
        licenseUrl = $source.LicenseUrl
        mainLibraries = $source.MainLibraries
        copiedFiles = @($copiedNames | Sort-Object)
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    $metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $platformDir "LIBMPV_SOURCE.json") -Encoding utf8NoBOM

    Write-Host "Staged libmpv for $resolvedPlatform at $platformDir"
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
