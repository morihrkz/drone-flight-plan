# build-spec.ps1
# specification.md -> ../specification.html を生成する（サイト体裁付き・再生成可能）。
#
# 正本はリポジトリ直下の specification.md。
# specification.html は生成物なので手で直接編集しないこと。
# 仕様を変えたら specification.md を直し、このスクリプトを実行して再生成する。
#
# 必要環境: pandoc（https://pandoc.org/）
# 実行例（リポジトリのどこからでも可）:
#   pwsh -NoProfile -File tools/build-spec.ps1
#
# 注意: userguide.html は手作業で維持しているため、ここでは生成しない（上書き厳禁）。

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot   # リポジトリのルート（tools/ の親）
Push-Location $root
try {
    pandoc specification.md -s `
        --toc --toc-depth=2 `
        --shift-heading-level-by=-1 `
        -V pagetitle="仕様書" `
        --include-in-header=tools/spec-style.html `
        --include-before-body=tools/spec-header.html `
        --include-after-body=tools/spec-footer.html `
        -o specification.html
    Write-Host "Generated: specification.html"
}
finally {
    Pop-Location
}
