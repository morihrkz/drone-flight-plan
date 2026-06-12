# UI スタイルガイド（Design Guidelines）

ドローンパイロットが**屋外の強い日差しの下でスマートフォンを片手に操作する**ことを前提とした統一ルール。
共通スタイルの実装は [theme.css](theme.css) に集約し、各ページは theme.css を読み込んだうえで、ページ固有のスタイルだけを `<style>` に書く。

## 3つの設計原則

1. **視認性（直射日光下で読める）**
   - フォームラベルは濃色 `--label: #3A4032`・13px・太字。淡色 `--muted` は補足注記（11〜12px）のみに使う
   - 重要な数値（計算結果など）は 22px 太字 `--accent`
2. **誤操作防止**
   - 入力欄の文字サイズは **16px 固定**（iOS Safari のフォーカス時自動ズームを抑止）
   - タッチターゲットは原則 **44px 以上**（date/time 入力は `min-height: 44px`）
   - 破壊的操作（削除など）は `confirm()` を挟み、danger 色で区別する
3. **隠れ UI を作らない**
   - 上部ナビは狭い画面では**折り返して全リンクを常時表示**（横スクロールで隠さない）
   - 警告は色だけに頼らず、アイコン（⚠）＋枠線＋背景色で多重に示す

## カラートークン（theme.css `:root`）

| トークン | 値 | 用途 |
|---|---|---|
| `--accent` | #25364A | ヘッダー・主要ボタン・強調値 |
| `--accent-light` | #EEF2E4 | 選択状態・カード見出し背景 |
| `--text` | #2D3325 | 本文 |
| `--label` | #3A4032 | フォームラベル専用の濃色 |
| `--muted` | #72786B | 補足注記のみ |
| `--border` | #C8CEC0 | 罫線 |
| `--bg` | #F5F3EC | ページ背景 |
| `--danger` / `--danger-dark` | #b03a3a / #8a2f2f | 警告の枠線・アイコン／文字 |
| `--ok` / `--ok-bg` / `--ok-text` | #9DB87C / #F2F7EA / #3E5226 | 良好状態 |

## タイポグラフィ

- 本文 15px / 入力 16px（600）/ ラベル 13px（700）/ 注記 11〜12px
- カード見出し 13〜16px（700）/ 結果値 22px（700）

## 余白・形状

- コンテナ: `padding: 28px 20px 60px`（480px 以下: `20px 12px 48px`）。`max-width` のみ各ページで指定
- カード: 角丸 `--radius`(8px)・`padding: 20px 18px`（モバイル 16px 14px）・間隔 24px
- 入力欄: 角丸 6px・`padding: 10px 12px`・フォーカスは `outline: 2px solid var(--accent)`
- フォームの段組は `.field-row` / `.field-row-3`（狭い画面では1カラムに折り畳み）

## 新しいページを作るとき

1. `<head>` に `manifest.json` → `theme-color` → **`theme.css`** の順で読み込み、その後にページ固有 `<style>`
2. `site-header` / `site-nav`（`aria-current="page"` を付ける）/ `.container` の骨格を踏襲
3. sw.js の `ASSETS` に追加し、`CACHE_NAME` のバージョンを上げる
