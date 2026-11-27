# Generate a random bearer token for the HTTP transport (paste into .env as MCP_AUTH_TOKEN).
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
