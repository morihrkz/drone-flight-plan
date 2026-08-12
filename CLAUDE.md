# drone-flight-plan 開発ルール

## プロジェクト概要
ドローン運用のための Web ツールキット。GitHub Pages で公開している PWA（オフライン対応）。
公開URL: https://morihrkz.github.io/drone-flight-plan/

## マルチマシン作業フロー（最重要）
このプロジェクトは複数のマシン（Windows PC 2台・MacBook Pro）で作業し、GitHub をハブとして同期する。

- **作業を始めるとき（最初に必ず）**: `git pull` で最新を取得してから着手する。
- **作業を終えたとき（その場で必ず）**: `git add .` → `git commit -m "..."` → `git push` する。
- **鉄則: 始める前に pull、終わったら push。** 別マシンに移る前に必ず push すること。push し忘れたまま別マシンで作業を始めると競合の原因になる（specification.md / userguide.html で実際に発生した）。

### git 同期されないローカル設定（各マシン手動設置）
- `.gitignore` は1行目で自分自身を ignore しているため git 管理外。内容: `.gitignore` / `.claude/` / `etc/` / `INSTRUCTIONS-*.md`。変更しても他マシンには伝播しないので、変更したら「このマシンのみ反映・他マシンは手動」とユーザーに明示する。
- `.claude/settings.json` に SessionStart フックを設置している（`git fetch` し、ローカルが `origin/main` より遅れているときだけ「git pull を検討」と警告。自動 pull はしない）。`.claude/` も git 管理外のため、新しいマシンや再セットアップ時は各マシンで手動で同じ内容を設置する。フックは bash 前提（Windows は Git Bash、Mac は標準 bash で動く）。

### git push の前提（この Windows マシン）
- push は SSH（git@github.com）。SSH 鍵はパスフレーズ付きで Windows の ssh-agent サービスに登録済み、`git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"` 設定済み（Git 同梱 ssh は Windows の agent に繋がらないため）。
- push が「Permission denied (publickey)」で失敗したら、まず `ssh-add -l` で鍵が agent に載っているか確認する。空ならユーザー自身のターミナルで `ssh-add ~/.ssh/id_ed25519`（パスフレーズ入力）を実行してもらう。

## 技術スタック（変更しない）
- アプリ本体はバニラ HTML / CSS / JavaScript のみ。フレームワーク・ビルドツール・外部依存は導入しない。
- 例外はドキュメント生成の pandoc のみ（下記「仕様書HTMLの再生成」参照。アプリ本体には影響しない）。

## ファイル構成
- ページ: `index.html`（ハブ）, `aircraft.html`（機体管理）, `flight-plan.html`, `calculator.html`, `checklist.html`, `flight-log.html`, `data.html`（データ管理）
- 共通: `flight-calc.js`（計算ロジック）, `storage-keys.js`（localStorage キー定義）, `theme.css`（スタイル）
- PWA: `sw.js`（Service Worker）, `manifest.json`, `icon-192.png`, `icon-512.png`
- ドキュメント: `specification.md`（仕様の正本）, `specification.html`（生成物・直接編集禁止）, `userguide.html`（操作マニュアル・手作業維持）, `DESIGN-GUIDELINES.md`
- `tools/`: `build-spec.ps1`（仕様書HTML生成）, `spec-style.html` / `spec-header.html` / `spec-footer.html`（pandoc 用テンプレート）, `spec-regen-verify.md`（再生成の検証手順・合否基準）
- `etc/`: ドキュメントの変換生成物（docx/pdf/html 等）と補助スクリプト（git 管理外）。手で直接編集しない。元の .md を直し、変換し直す。

## 仕様書HTML（specification.html）の再生成
- 正本はリポジトリ直下の `specification.md`。仕様を変えたら md を直し、`pwsh -NoProfile -File tools/build-spec.ps1` で `specification.html` を再生成する。
- **pandoc は 3.10 を使うこと**（他版だと先頭の既定CSSブロックに差分ノイズが出る）。
- `spec-style.html` の body には pandoc 既定CSS `max-width:36em` を打ち消す `max-width:none` が入っている。**消さないこと**（消すと本文幅が狭くなる。過去に再発あり）。
- `userguide.html` は手作業維持で build-spec の対象外（上書き禁止）。

## 設計原則（非交渉）
- データ永続化は localStorage を使う。サーバDBやCookieに置き換えない。
- 機能を変更したら、`specification.md` と `userguide.html` も必ず同時に更新する。
- データ管理ページ（`data.html`）は「機体管理 / 飛行ログ / 設定（インポート・エクスポート）」の3タブ構成を維持する。
- 国土交通省の様式1・様式2の項目と整合させる。
- 見た目・UI は `DESIGN-GUIDELINES.md` に従う。
- `site-header`（濃色バー）は全ページで意図的に空。ロゴ・タイトル・ホーム導線で埋める提案をしない（理由: 屋外でスマートフォンを片手操作する前提のため、縦スペースをヘッダーで圧迫しない。ユーザー却下済みの提案）。

### 最終更新日の管理ルール
- `userguide.html` と `specification.md` の内容を変更したら、必ずページ最下部の「Last updated: YYYY-MM-DD」を変更日に更新する。
- `specification.html` は直接編集せず、md 更新後の再生成で反映する。

## PWA / Service Worker（事故りやすい・要注意）
- `sw.js` は stale-while-revalidate でキャッシュする。キャッシュ対象は `ASSETS` 配列。
- キャッシュ対象ファイルを追加・削除・リネームしたら、必ず `ASSETS` を更新し、かつ `CACHE_NAME` のバージョン番号を上げる（現在値は `sw.js` を正とする。ここに数値は書かない＝ドリフト防止）。
- バージョンを上げ忘れると、利用者の端末に古い画面が残り続ける。

## コーディング方針
- 小さい単位で変更し、各段階で動作確認できる形にする。
- 既存のファイル構成・命名規則を踏襲する。
- ローカル確認は `python -m http.server 8080`（Mac では `python3 -m http.server 8080`）を使い、`http://localhost:8080` を開く。
- 大きな変更は、着手前に手順を提示して確認を取る。
- 検証はサンドボックスとフォルダの同期遅延が起こりうるため、計算ロジックを抽出した単体テスト(または jsdom)で行い、実ファイルの更新確認は別途行う。

## 変更完了チェックリスト（Definition of Done）
1. キャッシュ対象ファイルを追加・削除・リネームした場合: `sw.js` の `ASSETS` を更新し、`CACHE_NAME` の番号を上げた。
2. 機能を変更した場合: `specification.md` と `userguide.html` を更新し、両方の Last updated を変更日にした。`specification.md` を変えた場合は `specification.html` を再生成した。
3. `python -m http.server 8080` で `http://localhost:8080` を開き、変更箇所の動作を確認した。
4. `git add .` → `git commit` → `git push` まで完了した（commit メッセージは日本語で変更内容を要約）。

（応答スタイル・日本語などの全般的な好みはグローバルの `~/.claude/CLAUDE.md` に集約）
