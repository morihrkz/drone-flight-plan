# drone-flight-plan 開発ルール

## プロジェクト概要
ドローン運用のための Web ツールキット。GitHub Pages で公開している PWA（オフライン対応）。
公開URL: https://morihrkz.github.io/drone-flight-plan/

## マルチマシン作業フロー（最重要）
このプロジェクトは複数のマシン（Windows PC 2台・MacBook Pro）で作業し、GitHub をハブとして同期する。

- **作業を始めるとき（最初に必ず）**: `git pull` で最新を取得してから着手する。
- **作業を終えたとき（その場で必ず）**: `git add .` → `git commit -m "..."` → `git push` する。
- **鉄則: 始める前に pull、終わったら push。** 別マシンに移る前に必ず push すること。push し忘れたまま別マシンで作業を始めると競合（コンフリクト）の原因になる。

## 技術スタック（変更しない）
- バニラ HTML / CSS / JavaScript のみ
- フレームワーク・ビルドツール・外部依存は導入しない

## ファイル構成
- ページ: `index.html`（ハブ）, `aircraft.html`（機体管理）, `flight-plan.html`, `calculator.html`, `checklist.html`, `flight-log.html`, `data.html`（データ管理）
- 共通: `flight-calc.js`（計算ロジック）, `theme.css`（スタイル）
- PWA: `sw.js`（Service Worker）, `manifest.json`, `icon-192.png`, `icon-512.png`
- ドキュメント: `specification.md`（spec）, `userguide.html`（操作マニュアル）, `DESIGN-GUIDELINES.md`
- `etc/`: 上記ドキュメントの変換生成物（docx/pdf/html 等）と補助スクリプト。手で直接編集しない。元の .md を直し、変換し直す。

## 設計原則（非交渉）
- データ永続化は localStorage を使う。サーバDBやCookieに置き換えない。
- 機能を変更したら、`specification.md` と `userguide.html` も必ず同時に更新する。
- データ管理ページ（`data.html`）は「機体管理 / 飛行ログ / 設定（インポート・エクスポート）」の3タブ構成を維持する。
- 国土交通省の様式1・様式2の項目と整合させる。
- 見た目・UI は `DESIGN-GUIDELINES.md` に従う。

## PWA / Service Worker（事故りやすい・要注意）
- `sw.js` は stale-while-revalidate でキャッシュする。キャッシュ対象は `ASSETS` 配列。
- キャッシュ対象ファイルを追加・削除・リネームしたら、必ず `ASSETS` を更新し、かつ `CACHE_NAME`（現在 `drone-tools-v5`）のバージョン番号を上げる。
- バージョンを上げ忘れると、利用者の端末に古い画面が残り続ける。

## コーディング方針
- 小さい単位で変更し、各段階で動作確認できる形にする。
- 既存のファイル構成・命名規則を踏襲する。
- ローカル確認は `python -m http.server 8080`（Mac では `python3 -m http.server 8080`）を使い、`http://localhost:8080` を開く。
- 大きな変更は、着手前に手順を提示して確認を取る。

（応答スタイル・日本語などの全般的な好みはグローバルの `~/.claude/CLAUDE.md` に集約）