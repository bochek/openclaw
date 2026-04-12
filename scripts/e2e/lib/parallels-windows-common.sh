#!/usr/bin/env bash

parallels_windows_permission_helpers_ps() {
  cat <<'EOF'
function Assert-NonBroadWritableInstall {
  $broadSidValues = @(
    ([Security.Principal.SecurityIdentifier]::new([Security.Principal.WellKnownSidType]::WorldSid, $null)).Value,
    ([Security.Principal.SecurityIdentifier]::new([Security.Principal.WellKnownSidType]::BuiltinUsersSid, $null)).Value,
    ([Security.Principal.SecurityIdentifier]::new([Security.Principal.WellKnownSidType]::AuthenticatedUserSid, $null)).Value
  )
  $writeMask =
    [Security.AccessControl.FileSystemRights]::Write -bor
    [Security.AccessControl.FileSystemRights]::Modify -bor
    [Security.AccessControl.FileSystemRights]::FullControl -bor
    [Security.AccessControl.FileSystemRights]::CreateFiles -bor
    [Security.AccessControl.FileSystemRights]::CreateDirectories -bor
    [Security.AccessControl.FileSystemRights]::AppendData -bor
    [Security.AccessControl.FileSystemRights]::WriteAttributes -bor
    [Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
    [Security.AccessControl.FileSystemRights]::Delete -bor
    [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
    [Security.AccessControl.FileSystemRights]::ChangePermissions -bor
    [Security.AccessControl.FileSystemRights]::TakeOwnership

  function Assert-NonBroadWritablePath {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
      return
    }

    $acl = Get-Acl -LiteralPath $Path
    foreach ($rule in $acl.Access) {
      if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) {
        continue
      }
      try {
        $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      } catch {
        continue
      }
      if ($broadSidValues -notcontains $sid) {
        continue
      }
      if (($rule.FileSystemRights -band $writeMask) -ne 0) {
        throw "broad writable install artifact: $Path ($($rule.IdentityReference.Value): $($rule.FileSystemRights))"
      }
    }
  }

  $root = (& npm.cmd root -g).Trim()
  Assert-NonBroadWritablePath -Path (Join-Path $root 'openclaw')
  Assert-NonBroadWritablePath -Path (Join-Path $root 'openclaw\extensions')
  Get-ChildItem -LiteralPath (Join-Path $root 'openclaw\extensions') -Directory -ErrorAction SilentlyContinue |
    ForEach-Object {
      Assert-NonBroadWritablePath -Path $_.FullName
    }
}
EOF
}
