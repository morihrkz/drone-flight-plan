# specification.html 再生成・検証メモ

このメモは、`specification.html` を `specification.md` から再生成して、手作業の同期結果が正しいかを **pandoc のあるマシンで** 確認するための手順書です。

## 背景（なぜこのメモがあるか）

`specification.html` は本来 `specification.md` からの生成物（`md → pandoc → html`）。
ところが過去に `specification.html` を手で直接編集していた（タイトルを「仕様書」に変更、ヘッダーバー削除、タイトルブロック削除、「版数：…」行削除、0.1 本文の修正）。
その手編集を、生成が同じ結果を再現できるよう **元ファイル側へ反映済み**：

| 反映内容 | 直したファイル |
|---|---|
| タブタイトル →「仕様書」／タイトルブロックを出さない | `tools/build-spec.ps1`（`--metadata title=…` を `-V pagetitle="仕様書"` に変更） |
| 先頭の「# …完全仕様書（再構築用設計図）」「版数：…」行＋区切り `---` を削除 | `specification.md` |
| 0.1 本文の文言修正 | `specification.md` |
| ヘッダーバー（site-header）削除 | `tools/spec-header.html` |
| 未使用 CSS（`.site-header` / `#title-block-header` / `h1.title` / `.subtitle,.author,.date`）削除 | `tools/spec-style.html` |

**この変更時点では pandoc が手元になく、再生成での検証ができていない。** それを後から確認するのが本メモの目的。

## 検証手順

1. pandoc を用意（このファイルは pandoc 3.10 で生成されたもの。`pandoc --version` で確認）
   - Windows: `winget install --id JohnMacFarlane.Pandoc`
   - Mac: `brew install pandoc`
2. リポジトリのルートで再生成（どこからでも可）：
   ```
   pwsh -NoProfile -File tools/build-spec.ps1
   ```
   （Mac で pwsh が無ければ pandoc を `tools/build-spec.ps1` の中身どおり直接叩いてもよい）
3. 差分を確認：
   ```
   git diff specification.html
   ```

## 合格の判定

- **理想は `git diff specification.html` が空**（手で同期した HTML と、再生成結果が一致）。
- 最低限、再生成後の `specification.html` が次を満たすこと：
  - [ ] `<head>` に `<title>仕様書</title>` がある
  - [ ] `<header class="site-header">` が **無い**
  - [ ] `<header id="title-block-header">` / `<h1 class="title">` が **無い**
  - [ ] 「版数：第2版…」の段落が **無い**
  - [ ] 0.1 の本文が「これは、…一から構築できる…仕様書である。」になっている
  - [ ] 目次（`</nav>`）と「0. このドキュメントについて」の間に `<hr />` が **無い**

## 差分が出たときの見分け方

`git diff specification.html` に差分が出ても、すべてが問題とは限らない：

- **想定内（無視してよい）**: pandoc のバージョン差による「先頭の既定スタイルブロック（`<style>` の1つ目、`html{color:…}` から始まる pandoc 自動生成 CSS）」や、コードハイライトの細部の違い。3.10 以外を使うとここに差分ノイズが出る。
- **要対応**: 上のチェックリスト項目が崩れている／本文（`<body>` 以降）の内容が変わっている場合。
  - その場合は **再生成結果を正** とみなし、元ファイル（`specification.md` / `tools/*`）側を直して再度生成する。
  - 一致させたら `specification.html` を再生成版で確定し、コミットする。

## 補足

- 1つ目の `<style>`（pandoc 既定 CSS）は自動生成で、未使用ルール（`task-list` / `columns` / `numberSource` / `smallcaps` 等）を含むが、**今回はあえて触っていない**（再生成で復活するため）。恒久的に削るならカスタム pandoc テンプレート（`--template`）の導入が必要で、それは別タスク。
- `specification.html` は `sw.js` のキャッシュ対象外。内容更新で `CACHE_NAME` を上げる必要はない。
