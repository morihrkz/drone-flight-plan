## 0. このドキュメントについて

### 0.1 位置づけ
これは、**このドキュメントとここに記載された素材だけがあれば、ソースコードが一切手元になくても、まったく同一のアプリケーションを一から構築できる**ことを目的とした仕様書である。機能の概要にとどまらず、データ構造のフィールド単位の定義、計算式、定数の実数値、UIコンポーネントの寸法・色、初期化処理の手順、印刷帳票の構造まで記述する。

### 0.2 想定読者
本書だけを渡されて本アプリを実装する開発者。HTML / CSS / JavaScript の基礎知識を前提とするが、本プロジェクト固有の知識（既存コード・設計経緯）は一切前提としない。

### 0.3 再構築の最小手順（概要）
1. 第3章のファイルをすべて作成する（全14ファイル）。
2. 第7章の `theme.css`（共通スタイル）を作る。
3. 第8章のデータモデルを正として、第9章の `flight-calc.js`、第10章の各ページを実装する。
4. 第11章に従い `manifest.json` / `sw.js` / アイコンを用意する。
5. 第13章に従いローカル確認・GitHub Pages へ配備する。

### 0.4 読み方の規約
- localStorage / sessionStorage のキー名は `drone-xxx` 形式の固定文字列。**変更不可**（既存データとの互換が壊れる）。
- HTML要素の `id` 属性はコード内で固定参照される。本書で `id` を明示している箇所は**その文字列をそのまま使う**こと。
- 「自動保存」は debounce なしの即時保存（`input`/`change` イベントで都度 localStorage へ書き込み）を指す。

---

## 1. プロダクト概要

### 1.1 目的
ドローン（無人航空機）運用に関わる以下の業務を、1つの静的Webアプリ（PWA）でブラウザ上一元管理する。

- 機体・操縦者情報の管理
- 飛行計画書の作成・印刷（PDF）
- 飛行前点検（チェックリスト）の実施・記録・印刷
- 飛行日誌（国土交通省 様式１）の記録・印刷
- 飛行記録の検索・集計・バックアップ（CSV / JSON）
- 飛行計算（飛行時間・GSD・目視可能距離等の参考算出）

### 1.2 対象ユーザー
個人操縦者・小規模事業者。航空法に基づく飛行計画・記録の作成を簡便化したい運用者。

### 1.3 設計思想（非交渉の原則）
1. **完全クライアントサイド**：サーバーサイド処理は一切ない。GitHub Pages 等の静的ホスティングで動く。
2. **データはローカルのみ**：すべて `localStorage`（一部 `sessionStorage`）に保存。外部送信なし。複数人共有は JSON ファイルの受け渡しで行う。
3. **ゼロ依存・バニラ**：フレームワーク・ビルドツール・外部ライブラリ・CDN を一切使わない。素の HTML / CSS / JavaScript のみ。
4. **オフライン対応（PWA）**：Service Worker により一度開けばオフラインで動作。ホーム画面に追加可能。
5. **屋外UI最優先**：直射日光下・スマホ片手・グローブ着用を想定した視認性／誤操作防止設計（第7章）。
6. **国の様式との整合**：チェックリストは様式２、日誌は様式１の項目に整合させる（第12章）。

### 1.4 法令的背景（実装に必要な範囲）
- **様式１（飛行記録 / JOURNEY LOG OF UAS）**：飛行日誌の印刷帳票の根拠。3年間の保存が求められる。
- **様式２（日常点検記録 / DAILY INSPECTION RECORD OF UAS）**：チェックリストの日常点検9項目の根拠。
- **DIPS 2.0・審査要領**：飛行計算ページの簡易法令チェックの根拠（25kg・100g・150m・130m等の閾値）。
- 本アプリの算出値・判定はすべて**参考値**であり、最終判断は運用者責任、という免責を UI とドキュメントに明記する。

---

## 2. 全体アーキテクチャ

### 2.1 ページ構成（7ページ）

| ファイル | 画面名 | 役割 |
|---|---|---|
| `index.html` | ホーム | 各ツールへのナビゲーション（リンクカード一覧） |
| `aircraft.html` | 機体管理 | 機体・操縦者の登録／編集／削除、総飛行時間表示、JSON入出力 |
| `flight-plan.html` | 飛行計画書 | 計画入力＋リアルタイムプレビュー、印刷(A4縦)、チェックリストへ引き継ぎ |
| `checklist.html` | 飛行前チェックリスト | 飛行前確認6項目＋様式２日常点検9項目、複数登録、印刷(A4縦) |
| `flight-log.html` | 飛行日誌 | 様式１の記録入力・1日分表示、日次JSON出力、印刷(A4横) |
| `data.html` | データ管理 | 計画書／チェックリスト／日誌の3タブ＋全データ一括入出力・消去 |
| `calculator.html` | 飛行計算（参考機能） | 飛行時間・目視可能距離・GSDの算出、法令簡易チェック |

### 2.2 中核ワークフロー
3画面が `drone-active-session`（localStorage）を介して連携する。

```
飛行計画書 (flight-plan.html)
   │ 「この計画で飛行前チェックリストへ進む」ボタン
   │ → drone-active-session に {step:'checklist', plan} を保存
   ▼
飛行前チェックリスト (checklist.html)
   │ セッションの plan を初期値転記。step を 'checking' に更新
   │ （チェック完了後、手動で「次へ（日誌）」リンク）
   ▼
飛行日誌 (flight-log.html)
   │ セッションまたは計画書下書きから初期値転記
   ▼
記録は drone-flight-log-records に蓄積
```

### 2.3 データ参照の関係
- **機体管理** が書く `drone-aircraft-list` を、計画書・日誌・計算（プリセットとは別）の「選択候補」が読む。
- **計画書** の下書き `drone-flight-plan-draft` を、チェックリスト・日誌・データ管理が初期値／表示に読む。
- **日誌** の `drone-flight-log-records` を、機体管理（総飛行時間集計）・データ管理・計算（実測比較）が読む。
- **機体の紐付けは「機体名の文字列完全一致」**で行う（外部キーIDではない）。機体名の変更・重複に注意が必要、という制約はこの設計に由来する。

### 2.4 全ファイル一覧（15ファイル＋ドキュメント）

| ファイル | 種別 | 内容 |
|---|---|---|
| `index.html` | ページ | ホーム |
| `aircraft.html` | ページ | 機体管理 |
| `flight-plan.html` | ページ | 飛行計画書 |
| `checklist.html` | ページ | チェックリスト |
| `flight-log.html` | ページ | 飛行日誌 |
| `data.html` | ページ | データ管理 |
| `calculator.html` | ページ | 飛行計算 |
| `theme.css` | 共通 | 全ページ共通スタイル（第7章） |
| `storage-keys.js` | 共通 | localStorage/sessionStorage キーとエクスポート書式識別子の正本（`DRONE_KEYS`/`DRONE_FORMATS`、第5.1）。キーを使う全ページがインラインスクリプトより前に読み込む |
| `flight-calc.js` | 共通 | 計算ロジック純粋関数群＋プリセット（第9章）。calculator.html のみが読み込む |
| `manifest.json` | PWA | Webアプリマニフェスト（第11章） |
| `sw.js` | PWA | Service Worker（第11章） |
| `icon-192.png` | PWA | アイコン 192×192 |
| `icon-512.png` | PWA | アイコン 512×512 |
| `.gitignore` | その他 | Git 無視設定 |
| `specification.md` / `userguide.html` / `DESIGN-GUIDELINES.md` | ドキュメント | 本書・操作マニュアル・UI指針 |

> `flight-calc.js` を読み込むのは `calculator.html` のみ。他ページは計算関数を必要としない（機体プリセットの共有は localStorage 経由）。

---

## 3. 共通実装規約

すべてのページがこの規約を踏襲する。再構築時はまずこの骨格をテンプレート化すると効率的。

### 3.1 HTML の `<head>` 読込順（厳守）
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ドローン運用ツール | （画面名）</title>
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#25364A">
  <link rel="stylesheet" href="theme.css">
  <style>/* ページ固有スタイルのみ。共通は theme.css */</style>
</head>
```
順序の理由：manifest → theme-color → theme.css → ページ固有 `<style>`。ページ固有スタイルで共通を上書きできるよう最後に置く。

### 3.2 共通ヘッダー・ナビゲーション
`<body>` 直下に必ず置く。

```html
<header class="site-header"></header>

<nav class="site-nav" aria-label="ツール間ナビゲーション">
  <a href="index.html">ホーム</a>
  <a href="aircraft.html">機体管理</a>
  <a href="flight-plan.html">計画書</a>
  <a href="checklist.html">チェックリスト</a>
  <a href="flight-log.html">日誌</a>
  <a href="data.html">データ管理</a>
  <a href="calculator.html">飛行計算</a>
</nav>
```
- 現在表示中のページのリンクには `aria-current="page"` を付ける（スタイルで強調＝第7章）。
- `.site-header` は中身が空でも高さ・背景を持つ帯として機能する（ロゴ等は持たない簡素な構成）。
- ナビは狭い画面で**折り返して全リンクを常時表示**（横スクロールで隠さない）。

### 3.3 Service Worker 登録（全ページの `</body>` 直前）
```html
<script>if("serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").catch(()=>{});}</script>
```

### 3.4 コンテナ
本文は `<div class="container">…</div>` に入れる。`max-width` のみ各ページの固有 `<style>` で指定する（共通の余白は theme.css）。ページ別 max-width：

| ページ | max-width |
|---|---|
| index | 560px |
| aircraft / data | 720px |
| flight-plan | （2カラムレイアウト。`.layout` がグリッド、`.doc` は max 680px） |
| checklist | 600px |
| flight-log | 640px |
| calculator | 1100px |

### 3.5 「選択または自由入力」コントロール（重要パターン）
機体名・操縦者名の入力は、登録候補からの選択と自由入力を1つの `<select>` で兼ねる。計画書・日誌で同一仕様。

- センチネル定数 `const MANUAL = '__manual__';`
- `<select>` の構成：先頭に `<option value="">（〇〇を選択）</option>`、続いて候補（重複除去・空除去）、末尾に `<option value="__manual__">＋手入力…</option>`。
- `change` 時、値が `MANUAL` なら `prompt()` で文字列を取得し、空でなければその値の `<option>` を末尾手入力オプションの直前に挿入して選択（`ensureOption`）。空ならクリア。
- 保存・読込時に値が `MANUAL` のままなら空文字として扱う。

擬似コード：
```js
function ensureOption(sel, value){
  if(![...sel.options].some(o => o.value === value)){
    const o = document.createElement('option');
    o.value = o.textContent = value;
    sel.insertBefore(o, sel.lastElementChild); // 末尾「＋手入力…」の前
  }
  sel.value = value;
}
function buildOptions(values, label){ // 候補生成
  const uniq = [...new Set(values.map(v => (v||'').trim()).filter(Boolean))];
  let html = `<option value="">（${label}を選択）</option>`;
  uniq.forEach(v => html += `<option value="${escAttr(v)}">${escAttr(v)}</option>`);
  html += `<option value="${MANUAL}">＋手入力…</option>`;
  return html;
}
```

### 3.6 HTML エスケープ
XSS防止のため、ユーザー入力を innerHTML へ差し込む箇所では必ずエスケープする。2系統が使われている：

- DOM経由（推奨・多用）：
```js
function esc(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
```
- 文字列置換（属性値用）：
```js
function escAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
```
- aircraft.html はもう1系統（`&<>"'` を実体参照化する `esc`）を使う。いずれでも機能的に等価。

### 3.7 localStorage 読み取りの定型
壊れた値・未保存に備え、必ず try/catch とフォールバックを置く：
```js
let arr = [];
try { arr = JSON.parse(localStorage.getItem(KEY)) || []; } catch(e) { arr = []; }
```

### 3.8 ファイルダウンロードの定型（JSON / CSV 出力）
```js
function downloadJSON(payload, filename){
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
```

### 3.9 日付フォーマット定型
- 当日 ISO：`todayISO()` → `YYYY-MM-DD`（`getFullYear` + 0埋め月日）。
- 和暦風表示：`fmtDateJP('2026-06-17')` → `2026年6月17日`（月日は `parseInt` で先頭ゼロを除去）。
- ファイル名スタンプ：`stamp()` → `YYYYMMDD`。

### 3.10 ID 命名規則
- フォーム入力：`f-xxx`（例 `f-name`, `f-date`, `f-registration`）。
- 検索：`s-xxx`。計算結果出力：`xx-out-xxx`。
- 一覧の各行ボタンは `data-act`（`edit`/`delete` 等）と `data-id` を持ち、親コンテナで**イベント委譲**して処理する。

---

## 4. デザインシステム（theme.css 完全仕様）

`theme.css` は基準ページ calculator.html を母体とした全ページ共通スタイル。以下をそのまま実装する。

### 4.1 リセット
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
```

### 4.2 カラートークン（`:root`）— 実数値
| 変数 | 値 | 用途 |
|---|---|---|
| `--accent` | `#25364A` | 基調色：ヘッダー・主要ボタン・強調値 |
| `--accent-light` | `#EEF2E4` | 基調の淡色：選択状態・カード見出し背景 |
| `--border` | `#C8CEC0` | 罫線 |
| `--text` | `#2D3325` | 本文 |
| `--muted` | `#72786B` | 補足文字（小さい注記のみ） |
| `--label` | `#3A4032` | フォームラベル専用の濃色（屋外視認性） |
| `--bg` | `#F5F3EC` | ページ背景 |
| `--white` | `#fff` | 白 |
| `--radius` | `8px` | カード角丸（入力欄は 6px 固定） |
| `--danger` | `#b03a3a` | 警告：枠線・アイコン |
| `--danger-dark` | `#8a2f2f` | 警告：文字 |
| `--ok` | `#9DB87C` | 良好：枠線 |
| `--ok-bg` | `#F2F7EA` | 良好：背景 |
| `--ok-text` | `#3E5226` | 良好：文字 |

### 4.3 body
```css
body{
  font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP",Meiryo,sans-serif;
  background:var(--bg); color:var(--text);
  font-size:15px; line-height:1.6; min-height:100vh;
}
```

### 4.4 ヘッダー・ナビ
```css
.site-header{ background:var(--accent); color:#fff; padding:14px 24px; display:flex; align-items:center; gap:12px; }
.site-header svg{ flex-shrink:0; }
.site-header h1{ font-size:18px; font-weight:700; letter-spacing:.03em; }
.site-header a{ color:inherit; text-decoration:none; display:flex; align-items:center; gap:12px; }

.site-nav{ background:var(--accent); padding:0 20px 10px; display:flex; gap:6px; flex-wrap:wrap; }
.site-nav a{
  color:rgba(255,255,255,.85); text-decoration:none; font-size:13px; font-weight:700;
  padding:5px 13px; border-radius:999px; white-space:nowrap; letter-spacing:.03em;
  transition:background .15s,color .15s;
}
.site-nav a:hover{ color:#fff; background:rgba(255,255,255,.14); }
.site-nav a[aria-current="page"]{ background:var(--accent-light); color:var(--accent); }
```

### 4.5 コンテナ・ラベル
```css
.container{ margin:0 auto; padding:28px 20px 60px; } /* max-width は各ページ */
.page-label{
  font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
  color:var(--muted); margin-bottom:20px; padding-bottom:8px; border-bottom:1px solid var(--border);
}
```

### 4.6 カード
```css
.card{ background:var(--white); border:1px solid var(--border); border-radius:var(--radius); padding:20px 18px; margin-bottom:24px; }
.card h2{
  font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
  color:var(--muted); margin-bottom:16px; padding-bottom:8px; border-bottom:1px solid var(--border);
}
```

### 4.7 フォーム（誤操作防止の核）
```css
.field{ margin-bottom:16px; min-width:0; }
.field label{ display:block; font-size:13px; font-weight:700; color:var(--label); margin-bottom:4px; }
.field input, .field select, .field textarea{
  width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:6px;
  font-size:16px;            /* iOS Safari のフォーカス時自動ズーム抑止のため 16px 固定 */
  font-family:inherit; background:var(--white); color:var(--text);
}
.field input, .field select{ font-weight:600; }
.field input, .field textarea{ -webkit-appearance:none; -moz-appearance:none; appearance:none; } /* select は矢印が消えるため除外 */
.field input:focus, .field select:focus, .field textarea:focus{ outline:2px solid var(--accent); outline-offset:-1px; }
.field textarea{ resize:vertical; min-height:72px; }
.field .hint{ font-size:11px; color:var(--muted); margin-top:2px; }
.field input.invalid{ border-color:var(--danger); background:#fdf3f3; }
input[type="date"], input[type="time"]{ min-height:44px; }   /* タッチターゲット 44px */

.field-row{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.field-row-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
```

### 4.8 ボタン
```css
.btn{
  padding:11px 16px; border-radius:var(--radius); font-family:inherit;
  font-size:14px; font-weight:700; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; gap:7px;
  transition:background .15s,color .15s,transform .1s;
  -webkit-tap-highlight-color:transparent; text-decoration:none;
}
.btn:active{ transform:scale(.98); }
.btn-primary{ background:var(--accent); color:#fff; border:2px solid var(--accent); width:100%; }
.btn-primary:hover{ background:#34495f; border-color:#34495f; }
.btn-outline{ background:transparent; color:var(--accent); border:2px solid var(--accent); }
.btn-outline:hover{ background:var(--accent); color:#fff; }
.btn-row{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
```
- ページ固有で `.btn-small`（min-height:44px の枠線ボタン）、`.btn-clear`（danger 枠線、全幅）、`.btn-clear-all` などを定義する。破壊的操作は danger 色で区別し `confirm()` を挟む。

### 4.9 注意ノート・空表示
```css
.note-warn{
  display:flex; gap:10px; align-items:flex-start; padding:10px 12px;
  background:#fff8e1; border:1px solid #f0c040; border-radius:6px;
  font-size:13px; color:#5a4500; line-height:1.65;
}
.note-warn svg{ flex-shrink:0; margin-top:2px; }
.empty-msg{
  text-align:center; color:var(--muted); font-size:14px; padding:28px 10px;
  background:var(--white); border:1px dashed var(--border); border-radius:var(--radius);
}
```

### 4.10 レスポンシブ
```css
@media (max-width:480px){
  .site-header{ padding:12px 16px; } .site-header h1{ font-size:16px; }
  .site-nav{ padding:0 14px 9px; }
  .container{ padding:20px 12px 48px; }
  .card{ padding:16px 14px; }
  .field-row, .field-row-3{ grid-template-columns:1fr; }
  .field input[type="date"], .field input[type="time"]{
    padding:6px 8px; line-height:1.2; max-width:100%; overflow:hidden; text-overflow:ellipsis;
  }
}
@media (max-height:500px){ .field-row, .field-row-3{ grid-template-columns:1fr; } } /* 横向き低高さ端末 */
```

### 4.11 印刷共通
```css
@media print{ .site-nav{ display:none !important; } }
```
各ページの印刷帳票は固有 `<style>` の `@media print` で詳細定義（第10・12章）。共通の作法：
- `@page{ size:A4 (portrait|landscape); margin:0; }`（margin:0 でブラウザのURL/日付/ページ番号を消し、紙余白は帳票要素の padding(mm) で確保）。
- `*{ -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }`（背景色・罫線を強制印刷）。
- 画面UI（`.site-header`, `.site-nav`, `.container` 等）を `display:none !important`、印刷専用 `.print-doc` を `display:block`。

### 4.12 3つの設計原則（実装判断の指針）
1. **視認性（直射日光下で読める）**：ラベルは `--label` 13px 太字。`--muted` は補足注記（11〜12px）のみ。重要数値は 22px 太字 `--accent`。
2. **誤操作防止**：入力欄文字 16px 固定。タッチターゲット 44px 以上。破壊的操作は `confirm()` ＋ danger 色。
3. **隠れUIを作らない**：ナビは折り返して全リンク常時表示。警告は色だけでなくアイコン（⚠）＋枠線＋背景で多重表現。

---

## 5. データモデル（完全スキーマ）

本章が再構築の「正」。各ストレージキーの型・フィールド・例を定義する。すべて `JSON.stringify` で保存。

### 5.1 ストレージキー一覧

| キー | 場所 | 型 | 内容 |
|---|---|---|---|
| `drone-aircraft-list` | localStorage | 配列 | 機体・操縦者の登録情報 |
| `drone-flight-log-records` | localStorage | 配列 | 飛行記録（様式１相当）全件 |
| `drone-flight-plan-draft` | localStorage | オブジェクト | 飛行計画書の下書き1件 |
| `drone-checklist-records` | localStorage | 配列 | チェックリスト（実施年月日＋登録記号ごと）全件 |
| `drone-active-session` | localStorage | オブジェクト | 計画書→チェックリスト→日誌の引き継ぎ |
| `drone-calc-draft` | localStorage | オブジェクト | 飛行計算の入力ドラフト（全input/selectのid→value） |
| `drone-calc-summary` | localStorage | オブジェクト | 飛行計算結果（計画書備考への適用用） |
| `drone-aircraft-presets-v2` | localStorage | 配列 | 飛行計算のユーザー機体プリセット |
| `drone-edit-request` | sessionStorage | 文字列 | データ管理→日誌 の編集対象 id |
| `drone-checklist-edit-request` | sessionStorage | 文字列 | データ管理→チェックリスト の編集対象 id |
| `drone-flight-log-header` / `drone-flight-log-meta` / `drone-checklist-state` | localStorage | （レガシー） | 旧版の補助キー。現行コードは書き込まず、データ管理の全消去でクリーンアップ対象に含めるのみ |

> **キーの一元管理（`storage-keys.js`）**：上記キー文字列とエクスポート書式識別子（`app` フィールド）は `storage-keys.js` の2オブジェクトに集約し、各ページはここを参照する（キー文字列を直書きしない＝表記ゆれ・タイプミスによるページ間データ不整合の防止）。`storage-keys.js` をインラインスクリプトより前に読み込むこと（通常スクリプトなのでトップレベル `const` が後続スクリプトから参照可能）。互換のため文字列は安易に変更しない。
>
> | JS参照 | キー文字列 |
> |---|---|
> | `DRONE_KEYS.aircraftList` | `drone-aircraft-list` |
> | `DRONE_KEYS.flightLogRecords` | `drone-flight-log-records` |
> | `DRONE_KEYS.flightPlanDraft` | `drone-flight-plan-draft` |
> | `DRONE_KEYS.checklistRecords` | `drone-checklist-records` |
> | `DRONE_KEYS.activeSession` | `drone-active-session` |
> | `DRONE_KEYS.calcDraft` | `drone-calc-draft` |
> | `DRONE_KEYS.calcSummary` | `drone-calc-summary` |
> | `DRONE_KEYS.aircraftPresets` | `drone-aircraft-presets-v2` |
> | `DRONE_KEYS.editRequest` | `drone-edit-request` |
> | `DRONE_KEYS.checklistEditRequest` | `drone-checklist-edit-request` |
> | `DRONE_KEYS.flightLogHeader` / `flightLogMeta` / `checklistState` | （同名のレガシー補助キー） |
> | `DRONE_FORMATS.aircraft` / `flightPlan` / `checklist` / `flightLog` / `dailyRecord` / `allData` | エクスポート JSON の `app` 値（`drone-aircraft` 等） |

### 5.2 `drone-aircraft-list`（機体）
配列。各要素：
```json
{ "id": "ac-l9k3f2", "name": "DJI Mavic 3", "regNo": "JU1234567890", "pilot": "山田 太郎", "carryoverMinutes": 1200 }
```
| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ○ | `'ac-' + Date.now().toString(36)`。JSON取込での新規時は更に乱数4桁を付与 |
| `name` | string | ○ | 機体名。**重複不可**（紐付けキー） |
| `regNo` | string | － | 機体番号（JU番号）。未入力時は空文字 |
| `pilot` | string | － | 担当操縦者 |
| `carryoverMinutes` | number(int≥0) | － | 導入前の繰越総飛行時間（分）。未入力は 0 |

### 5.3 `drone-flight-log-records`（飛行日誌）
配列。各要素のフィールド（保存対象は固定リスト `FIELDS`）：
```json
{
  "id": 1718600000000,
  "date": "2026-06-17", "summary": "〇〇橋梁点検業務",
  "flightplace": "東京都千代田区丸の内", "weather": "晴れ", "wind": "北風 2m/s",
  "aircraft": "DJI Mavic 3", "registration": "JU1234567890", "carryover": "1200",
  "pilot": "山田 太郎", "takeoff": "10:00", "landing": "10:18", "time": "18",
  "location": "35.68000, 139.76000", "landloc": "同左",
  "shoot": "橋梁下部の点検空撮", "anomaly": "", "confirmer": "佐藤 花子", "memo": ""
}
```
| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | `Date.now()`（追加時刻ミリ秒） |
| `date` | string `YYYY-MM-DD` | 飛行年月日。1日分絞り込みキー |
| `summary` | string | 飛行概要（総括）。計画書 project を初期表示 |
| `flightplace` | string | 飛行場所。計画書 location を初期表示 |
| `weather` / `wind` | string | 天候 / 風速 |
| `aircraft` | string | 機体名（機体管理との紐付けキー） |
| `registration` | string | 無人航空機の登録記号 |
| `carryover` | string | 繰越総飛行時間（分）。文字列で保持 |
| `pilot` | string | 飛行させた者の氏名 |
| `takeoff` / `landing` | string `HH:MM` | 離陸 / 着陸時刻 |
| `time` | string | 飛行時間（分）。離着陸時刻から自動算出（下記）。算出不能なら未設定 |
| `location` / `landloc` | string | 離陸場所 FROM / 着陸場所 TO |
| `shoot` | string | 飛行概要 NATURE OF FLIGHT |
| `anomaly` | string | 飛行の安全に影響のあった事項 |
| `confirmer` | string | 確認者 |
| `memo` | string | メモ（様式外） |

**飛行時間算出** `calcMinutes(takeoff, landing)`：両方あるとき `(着陸の総分) − (離陸の総分)`。負なら `+1440`（日跨ぎ）。どちらか欠けたら `null`。

> 廃止フィールド：`battery`（バッテリー番号。メモ欄と重複のため削除）。`squawk`/`squawkDate`/`action`/`actionDate`（記事＝不具合記録。当面「不具合なし」扱いで UI はコメントアウト。将来有効化前提でデータ構造の余地は残す）。

### 5.4 `drone-flight-plan-draft`（計画書下書き）
オブジェクト。
```json
{
  "project": "〇〇橋梁点検業務", "date": "2026-06-17", "start": "10:00", "end": "12:00",
  "location": "東京都千代田区丸の内1-1-1", "pilot": "山田 太郎",
  "purpose": "構造物点検・空中撮影", "notes": "【特定飛行】目視外飛行",
  "aircrafts": [ { "name": "DJI Mavic 3", "regNo": "JU1234567890" } ],
  "aircraft": "DJI Mavic 3"
}
```
| フィールド | 型 | 説明 |
|---|---|---|
| `project` | string | 案件名 |
| `date` | string | 飛行日 |
| `start` / `end` | string `HH:MM` | 飛行開始 / 終了時刻 |
| `location` | string | 飛行場所（住所） |
| `pilot` | string | 操縦者氏名 |
| `purpose` | string | 飛行目的 |
| `notes` | string | 備考（特定飛行クイック挿入・計算結果挿入を含む） |
| `aircrafts` | array | 機体配列 `{name, regNo}`（最大5）。**新スキーマ（正）** |
| `aircraft` | string | 機体名を ` / ` で連結した文字列。**旧スキーマ互換**。引き継ぎ・旧JSON復元のため併存保持 |

旧→新互換：`aircrafts` が無く `aircraft` 文字列があれば、` / ` で分割し `{name, regNo:''}` 配列に復元する。

### 5.5 `drone-checklist-records`（チェックリスト）
配列。各要素は **(実施年月日 + 登録記号) を一意キー**とする1件。
```json
{
  "id": 1718600000000, "date": "2026-06-17", "registration": "JU1234567890",
  "place": "丸の内", "inspector": "山田 太郎", "notes": "特になし",
  "checks": {
    "pilot_condition": true, "weather_check": true, "airspace_check": true,
    "surroundings_check": true, "special_application": true, "police_contact": true,
    "uas_general": true, "propeller": true, "frame": true, "communication_system": true,
    "propulsion_system": true, "power_system": true, "automatic_control_system": true,
    "flight_control_system": true, "battery_fuel": false
  },
  "remarks": { "battery_fuel": "残量表示にばらつき" }
}
```
| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | `Date.now()` |
| `date` | string | 実施年月日（キー1） |
| `registration` | string | 無人航空機の登録記号（キー2） |
| `place` | string | 実施場所 |
| `inspector` | string | 実施者 |
| `notes` | string | 特記事項 |
| `checks` | object | 全15項目キー→boolean。`true`=確認済/正常、`false`=未確認/異常 |
| `remarks` | object | 日常点検9項目のうち**異常があった項目のみ** key→異常内容文字列 |

`checks` のキーは飛行前6項目＋日常点検9項目（第10.4・12章で定義）。JSON出力時もこの英語キー名を用いる（旧 `chk-1` 連番形式は廃止）。

### 5.6 `drone-active-session`（引き継ぎ）
オブジェクト。
```json
{ "createdAt": 1718600000000, "step": "checklist", "plan": { /* readPlan() の結果 */ } }
```
| フィールド | 型 | 説明 |
|---|---|---|
| `createdAt` | number | 作成時刻 |
| `step` | string | `'checklist'`（計画書が設定）→ チェックリスト到達後 `'checking'` に更新 |
| `plan` | object | 計画書の `readPlan()` 出力（5.4 と同形） |

### 5.7 `drone-calc-draft`（計算ドラフト）
オブジェクト。calculator.html の全 `input`/`select` の `id` をキー、その `value`（文字列）を値とする平坦なマップ。`ac-preset` も保存するが、復元時は他フィールドより後に適用（プリセット選択状態の保持）。

### 5.8 `drone-calc-summary`（計算結果）
```json
{ "createdAt": 1718600000000, "aircraft": "DJI Mavic 3", "text": "【飛行計算結果】機体：…\n可能飛行時間：…" }
```
計画書の「📋 飛行計算の結果を備考に挿入」が `text` を備考へ追記し、`aircraft` を1機目へ補完する。

### 5.9 `drone-aircraft-presets-v2`（ユーザー機体プリセット）
配列。各要素は内蔵プリセットと同形（第9.5）：
```json
{ "name":"自社機A", "massKg":0.92, "rotors":4, "propIn":9.4, "capMah":5000,
  "voltV":14.8, "sensor":"4/3型(M4/3)", "focalMm":12.3, "imgW":5280, "imgH":3956, "sizeM":0.38 }
```
読み出し時 `custom:true` が付与され、UI で「★」表示される。

### 5.10 編集リクエスト（sessionStorage）
- `drone-edit-request`：日誌記録の `id`（数値を文字列で）。data.html が set → flight-log.html が読み取り即削除し、その記録を編集モードで開く。
- `drone-checklist-edit-request`：チェックリストの `id`。data.html → checklist.html。
- いずれも**読み取り直後に `removeItem`**（1回限り）。

### 5.11 エクスポート／インポート ファイル形式
ファイルはローカルストレージとは別の構造を持つ。識別子 `app` で判別。

| 用途 | 構造 | 出力元 | ファイル名 |
|---|---|---|---|
| 機体 | `{ app:'drone-aircraft', exportedAt, aircraft:[...] }` | aircraft.html | `機体管理_YYYY-MM-DD.json` |
| 計画書 | `{ app:'drone-flight-plan', savedAt, plan:{...} }` | flight-plan.html / data.html | `<案件名>.json` / `flight-plan-YYYYMMDD.json` |
| チェックリスト | `{ app:'drone-checklist', exportedAt, checklist:[...] }` | data.html | `checklist-YYYYMMDD.json` |
| 日誌 | `{ app:'drone-flight-log', exportedAt, records:[...] }` | data.html | `flight-log-YYYYMMDD.json` |
| 1日分まとめ | `{ app:'drone-daily-record', version:2, exportedAt, date, plan, checklist, records }` | flight-log.html | `flight-YYYYMMDD.json` |
| 全データ | `{ app:'drone-all-data', version:1, exportedAt, data:{ aircraft, plan, checklist, records } }` | data.html | `drone-all-data-YYYYMMDD.json` |

インポートは寛容に：トップレベルが配列でも、`app` ラッパでも、対応する内側配列（`aircraft`/`checklist`/`records`）でも受ける。

### 5.12 CSV 出力形式（日誌）
- 文字コード：**BOM付きUTF-8**（先頭に `﻿`）。改行 `\r\n`。各値は `"` で囲み、内部の `"` は `""` にエスケープ。
- 列（順序固定）：
  | キー | 見出し |
  |---|---|
  | date | 飛行日 |
  | pilot | 操縦者 |
  | takeoff | 離陸時刻 |
  | landing | 着陸時刻 |
  | time | 飛行時間(分) |
  | location | 離陸場所 |
  | landloc | 着陸場所 |
  | aircraft | 機体 |
  | weather | 天候 |
  | wind | 風速 |
  | shoot | 飛行概要 |
  | anomaly | 異常記録 |
  | memo | メモ |

### 5.13 廃止キー（移行済み・再実装不要）
- `drone-flight-log-header`：登録記号・繰越総飛行時間。各レコードへ統合済み。
- `drone-flight-log-meta`：バックアップ通知。機能ごと廃止。
- `drone-checklist-state`：単一状態のチェックリスト。複数登録の `drone-checklist-records` へ移行（自動マイグレーションはしない）。
- 全データ消去はこれら旧キー＋`drone-active-session` も併せて `removeItem` する。

---

## 6. 計算ロジック仕様（flight-calc.js 完全）

すべて**純粋関数**。入力不正時は `null` を返す（呼び出し側で「―」表示）。グローバルスコープに関数・定数を定義（モジュール化しない）。

### 6.1 定数
```js
const GRAVITY = 9.80665;        // 重力加速度 [m/s^2]
const AIR_DENSITY_SL = 1.225;   // 海面上標準大気密度 [kg/m^3]
```
ヘルパ：`function isPos(v){ return Number.isFinite(v) && v > 0; }`

### 6.2 ホバリング所要電力 `hoverPowerW`
運動量理論：理想電力 `P_ideal = T^1.5 / sqrt(2·ρ·A)`、実機補正は FoM とドライブ効率で除す。
```
シグネチャ: hoverPowerW(totalMassKg, rotorCount, propDiameterM, figureOfMerit=0.65, driveEff=0.80, airDensity=1.225)
thrustN  = totalMassKg * GRAVITY
diskArea = rotorCount * π * (propDiameterM/2)^2
idealW   = thrustN^1.5 / sqrt(2 * airDensity * diskArea)
return     idealW / (figureOfMerit * driveEff)
不正(いずれかが非正)なら null
```

### 6.3 使用可能エネルギー `usableEnergyWh`
```
シグネチャ: usableEnergyWh(capacityMah, voltageV, reserveRatio=0.30, batteryHealth=1.0)
return (capacityMah/1000) * voltageV * batteryHealth * (1 - reserveRatio)
条件: capacityMah,voltageV,batteryHealth が正、かつ 0 ≤ reserveRatio < 1。違反なら null
```

### 6.4 飛行時間 `calcFlightTime(p)`
入力 `p`：`totalMassKg, rotorCount, propDiameterM, figureOfMerit, driveEff, airDensity, avionicsW, capacityMah, voltageV, reserveRatio, batteryHealth, cruiseFactor`。
```
hoverW = hoverPowerW(...)             // null なら全体 null
avionicsW = Number.isFinite(p.avionicsW) ? p.avionicsW : 10   // 既定 10W
totalW  = hoverW + avionicsW
limitWh = usableEnergyWh(cap, volt, 0, health)     // 予備率0 = 物理限界
opWh    = usableEnergyWh(cap, volt, reserveRatio, health)
cruiseFactor = isPos(p.cruiseFactor) ? p.cruiseFactor : 1.15
返り値 {
  hoverW: totalW,
  hoverLimitMin: (limitWh / totalW) * 60,
  flightTimeMin: (opWh / (totalW * cruiseFactor)) * 60
}
```

### 6.5 その他の距離・速度関数（calculator.html では一部のみ使用）
- `tetherHorizontalRangeM(L, H)`：係留水平限界 `√(L²−H²)`。`H≥L` なら 0。
- `radioRangeKm(txPowerDbm, txGainDbi, rxGainDbi, rxSensDbm, freqMhz, fadeMarginDb=15)`：FSPL `32.44 + 20log10(d_km) + 20log10(f_MHz)` を逆算。許容損失 `Ptx+Gtx+Grx−感度−マージン`、≤0 なら 0。
- `visualLineOfSightM(aircraftSizeM, safetyFactor=0.5)`：視角3分(arcmin)基準 `size / tan(3 arcmin) × safetyFactor`。`arcmin3 = (3/60)·π/180`。**目視可能距離（calculator のセクション2・法令チェックで使用）**。
- `eventBufferDistanceM(alt)`：催し上空の立入禁止距離。≤20m→30 / ≤50m→40 / ≤100m→60 / ≤150m→70 / >150m→null。
- `safeSpeedMps(totalMassKg, maxEnergyJ=25)`：`√(2·E/m)`。

### 6.6 GSD 関数
- `calcGsd({sensorWmm, sensorHmm, focalMm, imageWpx, imageHpx, altitudeM})`：
  ```
  gsdCm       = (sensorWmm * altitudeM * 100) / (focalMm * imageWpx)
  footprintWm = (sensorWmm * altitudeM) / focalMm
  footprintHm = (sensorHmm * altitudeM) / focalMm
  ```
- `altitudeForGsdM(targetGsdCm, focalMm, imageWpx, sensorWmm)`：`(targetGsdCm * focalMm * imageWpx) / (sensorWmm * 100)`。

### 6.7 内蔵機体プリセット `AIRCRAFT_PRESETS`（実数値・全9機種）
各要素 `{ name, massKg, rotors, propIn, capMah, voltV, sensor, focalMm, imgW, imgH, sizeM }`。値はメーカー公表値の近似。

| name | massKg | rotors | propIn | capMah | voltV | sensor | focalMm | imgW | imgH | sizeM |
|---|---|---|---|---|---|---|---|---|---|---|
| DJI Neo | 0.135 | 4 | 3.0 | 1435 | 3.87 | 1/2型 | 3.4 | 4000 | 3000 | 0.16 |
| DJI Mini 4 Pro | 0.249 | 4 | 6.0 | 2590 | 7.32 | 1/1.3型 | 6.7 | 8064 | 6048 | 0.30 |
| DJI Avata 2 | 0.377 | 4 | 3.0 | 2150 | 14.76 | 1/1.3型 | 2.1 | 4000 | 3000 | 0.21 |
| DJI Air 3 | 0.720 | 4 | 8.7 | 4241 | 14.76 | 1/1.3型 | 6.7 | 8064 | 6048 | 0.42 |
| DJI Air 3S | 0.724 | 4 | 8.7 | 4276 | 14.6 | 1型(CMOS) | 8.8 | 8192 | 6144 | 0.42 |
| DJI Mavic 3 | 0.895 | 4 | 9.4 | 5000 | 15.4 | 4/3型(M4/3) | 12.3 | 5280 | 3956 | 0.38 |
| DJI Mavic 3 Pro | 0.958 | 4 | 9.4 | 5000 | 15.4 | 4/3型(M4/3) | 12.3 | 5280 | 3956 | 0.38 |
| DJI Phantom 4 Pro | 1.388 | 4 | 9.4 | 5870 | 15.2 | 1型(CMOS) | 8.8 | 5472 | 3648 | 0.35 |
| DJI Matrice 350 RTK | 6.47 | 4 | 21.0 | 5880 | 44.76 | 4/3型(M4/3) | 12.3 | 5280 | 3956 | 0.90 |

### 6.8 センサープリセット `SENSOR_PRESETS`（実数値・全8種、単位mm）
| キー | w | h |
|---|---|---|
| 1/2.3型 | 6.17 | 4.55 |
| 1/2型 | 6.40 | 4.80 |
| 1/1.7型 | 7.60 | 5.70 |
| 1/1.3型 | 9.60 | 7.20 |
| 1型(CMOS) | 13.2 | 8.8 |
| 4/3型(M4/3) | 17.3 | 13.0 |
| APS-C | 23.5 | 15.6 |
| フルサイズ | 36.0 | 24.0 |

### 6.9 プリセット入出力・日誌統計
```js
// キーは storage-keys.js の DRONE_KEYS を参照（calculator.html が storage-keys.js を先に読み込む）
function loadUserPresets(){ try{ return JSON.parse(localStorage.getItem(DRONE_KEYS.aircraftPresets))||[]; }catch(e){ return []; } }
function saveUserPresets(list){ localStorage.setItem(DRONE_KEYS.aircraftPresets, JSON.stringify(list)); }
function allAircraftPresets(){ return [...AIRCRAFT_PRESETS, ...loadUserPresets().map(p => ({...p, custom:true}))]; }

// 日誌から実測飛行時間統計を取得（aircraftName 部分一致・大小無視。省略時は全件）
function flightLogStats(aircraftName){
  // time>0 のものを抽出 → { count, avgMin, totalMin }。該当なしは null
}
```

---

## 7. 画面仕様（ページ別）

各ページの「目的 / レイアウト / 入力ID / 主要挙動 / 初期化順序 / 印刷」を定義する。スタイルの実数値は各ページ固有 `<style>`。共通部分は第4章を参照。

### 7.1 ホーム（index.html）
- 目的：各ツールへの導線。`.container{max-width:560px}`。
- 上部に説明文 `.page-desc`（計画書→チェックリスト→日誌が一連で繋がり、計画書内容が自動引き継がれる旨）。
- 説明文の直下に青系の情報ノート `.note-info`（データはサーバー非保存・端末のブラウザ内のみ／別端末では非共有／ブラウザのデータ削除・プライベートモードで消えうる／定期的なバックアップ＝エクスポートが必要、の4点を箇条書き）。同趣旨のノートはデータ管理（data.html）先頭にも表示する（7.6）。
- `.tool-list`（縦並び）に6枚の `.tool-card`（`<a>`）。各カードは `.card-icon`（44×44、インラインSVGアイコン）＋`.card-body`（`.card-title`＋`.card-desc`）＋`.card-arrow`（右シェブロンSVG）。
- カードのリンク先と文言：
  | 遷移先 | タイトル | 説明 |
  |---|---|---|
  | aircraft.html | 機体管理 | 機体名・JU番号・担当操縦者・総飛行時間を登録管理 |
  | flight-plan.html | 飛行計画書 | 飛行内容を入力してPDFの飛行計画書を作成 |
  | checklist.html | 飛行前チェックリスト | 飛行前の確認項目をチェック。状態は自動保存 |
  | flight-log.html | 飛行日誌 | 飛行時間・バッテリー・撮影内容・異常を累積記録 |
  | data.html | データ管理 | 日誌の一覧・検索（日付/場所/機体）・CSV/JSON出力 |
  | calculator.html | 飛行計算（参考機能） | 飛行時間・GSD・目視可能の目安を計算 |
- ホバー時：カード背景 `--accent-light`、`translateY(-2px)`、矢印が右へ 3px・色 `--accent`。
- JS なし（SW登録のみ）。

### 7.2 機体管理（aircraft.html）
- 目的：機体CRUD＋総飛行時間表示＋JSON入出力。`.container{max-width:720px}`。キー：`DRONE_KEYS.aircraftList`、`DRONE_KEYS.flightLogRecords`（いずれも storage-keys.js）。
- 構成：
  1. 登録/編集フォーム `#form-card`（見出し `#form-title`）。入力 `#f-name`（必須）, `#f-reg`, `#f-pilot`, `#f-carryover`(number,min0,step1)。`#btn-save`、編集時のみ表示の `#btn-cancel`（`.cancel-row` は `.editing` 時に表示）。
  2. 一覧カード：見出し横に `#btn-export`/`#btn-import`（+ 隠し `#import-file`）。`#list`、空時 `#empty`。
- 状態：`aircraft`（配列）、`editingId`。
- **保存ロジック**（`#btn-save`）：name必須・トリム。`name` 重複（自分以外）チェック→アラート。`carryover` は空なら0、`parseInt`、NaN/負はアラート。編集中(`editingId`あり)なら該当を更新、なければ `{ id:'ac-'+Date.now().toString(36), ...data }` を push。保存→フォームクリア→再描画。
- **総飛行時間表示**：`logMinutesByAircraft()` が日誌記録を機体名で合算（`time` を `parseInt`）。各機体の表示 = 繰越 `carryoverMinutes` ＋ 日誌合算。内訳「（繰越 ○ ＋ 日誌 ○）」を併記。`fmtMinutes(n)`：60以上は「H時間M分」、未満は「M分」。
- **編集**：`startEdit(id)` でフォームへ値ロード、見出しを「機体の編集：〇〇」、ボタン「この内容で更新する」、`#form-card` に `.editing`、スクロール＆フォーカス。
- **削除**：`confirm('機体「〇〇」を削除しますか？\n（日誌の過去の記録は削除されません）')`。
- **JSON出力**：`{ app:'drone-aircraft', exportedAt:ISO, aircraft }`、`機体管理_YYYY-MM-DD.json`。空なら警告。
- **JSON読込**：配列 or `aircraft` 配列を受理。**機体名で後勝ち**（一致は上書き、なければ新規。新規 id は `'ac-'+Date.now().toString(36)+乱数4`）。完了時「新規 N 件、上書き M 件」。
- 初期化：`load(); render();`。

### 7.3 飛行計画書（flight-plan.html）
- 目的：計画入力＋A4縦プレビュー＋印刷＋引き継ぎ。2カラム `.layout`（768px以下で1カラム）。左 `.form-panel`、右 `.preview-panel`（中に `.doc`）。
- キー：`DRONE_KEYS.flightPlanDraft`、`DRONE_KEYS.activeSession`、`DRONE_KEYS.aircraftList`、`DRONE_KEYS.calcSummary`。`MAX_AIRCRAFT=5`。
- 入力ID：`f-project, f-date, f-start, f-end, f-location, f-pilot(select), f-purpose, f-notes(textarea)`。機体行は `#aircraft-rows` 内に5行（`.ac-row` 内に `.ac-name`(select) と `.ac-reg`(text)）。
- `fields` 定義（input→preview→format）でプレビュー連動。プレビューID：`p-project, p-date, p-time, p-location, p-pilot, p-aircraft, p-purpose, p-notes, p-issued`。空値は「―」＋ `.empty`。
- **機体行の動的表示** `updateRowVisibility()`：先頭1行は常時表示。入力済み行があれば次の1行を出す（最大5）。
- **機体選択時**：登録機体名を選ぶと JU番号欄が空のとき `regNo` を自動補完。`＋手入力…` は `prompt`。
- **操縦者** `#f-pilot`：機体管理の `pilot` 候補＋手入力。
- **`readPlan()`**：fields の値（MANUALは空に）→ `aircrafts`（`readAircrafts()` で name/regNo、name|regNo いずれかあるもの）→ 旧互換 `aircraft`（name を ` / ` 連結）。
- **自動保存**：すべての入力 `input`/`change` で `update()`＋`saveDraft()`（`DRONE_KEYS.flightPlanDraft` へ即保存）。
- **特定飛行クイック挿入**（`.sp-btn` data-sp）：備考へ追記（トグルではない）。
  - night → `【特定飛行】夜間飛行`
  - bvlos → `【特定飛行】目視外飛行`
  - heavy → `【特定飛行】最大離陸重量25kg以上の機体の飛行`
  - drop → `【特定飛行】物件投下`
- **計算結果挿入** `#btn-insert-calc`：`drone-calc-summary` の `text` を備考へ（既存があれば2改行後）追記。1機目未入力なら `aircraft` を補完。
- **JSON保存/読込**：`{ app:'drone-flight-plan', savedAt, plan }`。ファイル名は `<project>.json`（禁止文字 `\/:*?"<>|` を `_`）。読込は `parsed.plan || parsed`。
- **チェックリストへ** `#btn-to-checklist`：`DRONE_KEYS.activeSession` に `{ createdAt:Date.now(), step:'checklist', plan }` を保存し `checklist.html` へ遷移。
- **データクリア** `#btn-clear`：confirm 後、入力全消去＋`DRONE_KEYS.flightPlanDraft` 削除。
- 印刷：`@page A4 portrait; margin:0`。`.doc` を `padding:18mm 16mm 20mm`。フォーム・プレビューラベルは非表示。`.doc`/`.doc-table` は `break-inside:avoid`。帳票見出し「ド ロ ー ン 飛 行 計 画 書 / Drone Flight Plan」、セクション「■ 飛行概要 / ■ 機体・操縦者情報 / ■ 備考」、フッターに作成日＋作成者/確認者サイン欄。
- 初期化順：`buildAircraftRows(); buildPilotSelect(); loadDraft(); updateRowVisibility(); update();`。

### 7.4 飛行前チェックリスト（checklist.html）
- 目的：飛行前確認6＋日常点検9（計15）を (実施年月日＋登録記号) ごとに複数登録。`.container{max-width:600px}`。
- キー：`DRONE_KEYS.checklistRecords`、`DRONE_KEYS.activeSession`、`DRONE_KEYS.aircraftList`、`DRONE_KEYS.flightPlanDraft`、`DRONE_KEYS.checklistEditRequest`（sessionStorage）。
- 構成：sticky 進捗バー（`#progress-count`「N / 15」、`#progress-bar` 幅%）／セッションバナー `#session-banner`／機体概要カード（`#f-date`, `#f-place`, `#f-registration`, `#f-inspector`）／飛行前確認 `#preflight-checklist`／日常点検 `#daily-checklist`／特記事項 `#f-notes`／`#reset-btn`／`#btn-print`／`#btn-to-log`。
- **項目定義**（第12章にキー一覧）。`PREFLIGHT`6件、`DAILY`9件。`ALL_KEYS = PREFLIGHT+DAILY`、`TOTAL=15`。
  - 飛行前確認はチェックボックス（既定オフ）。`special_application` には申請区分ガイド（包括/個別/承認のタグ表）、`police_contact` には警告ノート（平日午後4時締切）を `desc` として表示。
  - 日常点検は **既定オン＝正常**。`is-checked` クラスで見た目反転。チェックを外す（異常）と備考欄 `.result-row`（`#remarks-<key>`）が表示される。
- **チェックUI**：ネイティブ checkbox は視覚的に隠し（`.check-input` を opacity0）、カスタム `.check-box`（28×28、チェック時 `--accent` 塗り＋白チェックSVG）。キーボードフォーカスは `:focus-visible` で枠線。
- **レコード保存（upsert）** `save()`：現在の (date+registration) で既存を探す（`currentId` 優先、なければ date+registration一致）。あれば `Object.assign`、なければ `{ id:Date.now(), ...data }` を push。すべて空（日付も登録記号もチェックも無し）なら保存しない。`input`/`change` ごとに自動保存。
- **コンテキスト切替** `switchContext()`：date/registration 変更時、一致レコードがあれば読み込み、なければ currentId=null（チェックは現状維持＝新規）。
- **初期値転記** `applyInitialValues()`（保存値が無い欄のみ）：date←計画書date or 当日／place←計画書location／registration←（計画書1機目に一致する登録機体の regNo、なければ先頭機体、なければ計画書1機目 regNo）／inspector←（同 target の pilot、なければ計画書 pilot）。
- **印刷** `#btn-print`：選択中 date の全件を registration ごとにページ分割（A4縦）。各ページ＝様式２（点検箇所/点検内容/結果(正常|異常)/備考）＋飛行前確認事項（確認項目/✓確認済|未確認）＋特記事項＋実施場所/年月日/実施者。`beforeprint` でも再生成。
- **初期化順**：`loadRecords(); initSessionBanner();` → `initEditRequest()`（編集リクエストあれば該当を開いて終了）→ なければ：`applyInitialValues()` → セッション `step==='checklist'` なら `blankChecks(); switchContext();` し step を `'checking'` に更新、そうでなければ `switchContext()` → `updateProgress()`。

### 7.5 飛行日誌（flight-log.html）
- 目的：様式１記録の入力・1日分表示・日次出力・印刷。`.container{max-width:640px}`。
- キー：`DRONE_KEYS.flightLogRecords`、`DRONE_KEYS.activeSession`、`DRONE_KEYS.aircraftList`、`DRONE_KEYS.flightPlanDraft`、`DRONE_KEYS.checklistRecords`、`DRONE_KEYS.editRequest`（sessionStorage）。`FIELDS` は第5.3のフィールド配列（time/id除く17項目）。
- 構成：注意ノート（3年保存・バックアップ喚起）／セッションバナー／入力カード（環境概要／機体概要／記録の入力の3グループ）／サマリー（`#sum-count`,`#sum-time`）／一覧 `#log-list`／出力カード（`#btn-export`,`#btn-print`,`#btn-clear`）。
- 入力ID：環境＝`f-summary, f-date, f-flightplace, f-weather, f-wind`。機体＝`f-aircraft(select), f-registration, f-carryover(number), f-pilot(select)`。記録＝`f-takeoff, f-landing`（各 `.btn-rec`「🛫/🛬 記録」）, `#auto-time`, `f-location, f-landloc`（各「飛行場所をコピー」「GPS座標を取得」）, `f-shoot(textarea)`（「飛行概要をコピー」）, `f-anomaly, f-confirmer, f-memo(textarea)`。`#btn-save`「記録を追加/変更を保存」、`#btn-cancel`。
- **機体選択時**：登録機体を選ぶと `f-registration`←regNo、`f-carryover`←carryoverMinutes、`f-pilot`←pilot を**自動上書き**。
- **時刻記録**：`btn-rec-takeoff` は現在時刻 `HH:MM`、日付未設定なら当日、離陸場所が空で飛行場所があればコピー。着陸も同様。`updateAutoTime()` が `calcMinutes` を `#auto-time` に表示。
- **GPS** `fillGPS(id)`：`navigator.geolocation.getCurrentPosition`、`lat.toFixed(5), lng.toFixed(5)` を入力。`{enableHighAccuracy:true, timeout:10000}`。失敗時アラート。
- **保存** `#btn-save`：`readForm()`（MANUAL→空・トリム、time は calcMinutes 結果）。date/location/aircraft/memo がすべて空なら警告。編集中は該当を更新（time未定義なら既存維持）、新規は `{ id:Date.now(), ...data }`。保存後 `buildSelects()`、`clearTimesOnly()`（時刻欄のみクリア）、再描画。
- **一覧** `render()`：`f-date` の1日分のみ、離陸時刻降順（同値は id 降順）。各行に日付＋登録記号、時刻範囲＋分、メタ（操縦者・機体・離着陸場所・天候風速）、🎥飛行概要・⚠異常（danger色）・メモ、編集/削除。サマリーに件数と累計分（60以上は時間表記）。
- **日次JSON出力** `exportDailyJSON()`：date を確定し、当日の records と当日の checklist を集めて `{ app:'drone-daily-record', version:2, exportedAt, date, plan, checklist, records }`、`flight-YYYYMMDD.json`。記録もチェックも無ければ確認。
- **印刷**：選択 date を登録記号(なければ機体名、なければ「（登録記号未記入）」)でグループ化しページ分割（A4横）。様式１テーブル：No./飛行年月日/飛行させた者の氏名/飛行概要/離陸場所/着陸場所/離陸時刻OFF/着陸時刻ON/飛行時間/総飛行時間（行ごとに累積 running=繰越＋Σtime）/安全に影響した事項/確認者。
- **入力リセット** `#btn-clear`：confirm 後、入力欄のみクリア（記録は残す）。
- **初期化**：`load(); buildSelects();` → `navigator.storage.persist()`（可能なら）→ `initEditRequest()`（あれば編集モード）→ なければ `initSession()`（計画書/セッションから未入力欄のみ補完、セッションありかつ要約ありでバナー）→ date 未設定なら当日 → `render()`。

### 7.6 データ管理（data.html）
- 目的：3タブ管理＋全データ一括。`.container{max-width:720px}`。タブ：`plan`/`checklist`/`log`（`.tab-btn[data-tab]` と `.tab-panel#tab-xxx`）。
- コンテナ先頭（タブの上）に青系の情報ノート `.note-info`（データの保存場所とバックアップの必要性を案内。ホーム画面と同趣旨。末尾は「各タブのJSON／CSV出力でバックアップ」と表記）。
- キー：`DRONE_KEYS.flightLogRecords`, `DRONE_KEYS.aircraftList`, `DRONE_KEYS.flightPlanDraft`, `DRONE_KEYS.checklistRecords`, `DRONE_KEYS.checklistEditRequest`, `DRONE_KEYS.editRequest`（後2者は sessionStorage）。
- **計画書タブ**：`#plan-view` に下書きを項目表示（案件名/飛行日/時刻/飛行場所/操縦者/機体/飛行目的/備考。値があるものだけ）。`#btn-plan-export`（`{app:'drone-flight-plan',savedAt,plan}`, `flight-plan-YYYYMMDD.json`）、`#btn-plan-import`（`parsed.plan||parsed` で置換）。
- **チェックリストタブ**：`#cl-tbody` に date 降順一覧（実施年月日/登録記号/実施場所/実施者/異常件数）。編集＝`DRONE_KEYS.checklistEditRequest` に id をセットして checklist.html へ。削除＝confirm 後該当除去。`#btn-cl-export`（`{app:'drone-checklist',exportedAt,checklist}`）。`#btn-cl-import`：**id で後勝ちマージ**（id 無ければ採番）。
- **日誌タブ**：
  - 折りたたみ `details.collapsible`：①検索（`s-from, s-to, s-location, s-aircraft, s-keyword`）②総飛行時間集計（機体別、`renderSummary()`）。いずれも初期は閉。
  - `getFiltered()`：期間（date 文字列比較）・場所/機体（部分一致・小文字化）・キーワード（shoot/memo/anomaly/weather/wind を連結し含む）でフィルタ、date 降順。
  - 一覧テーブル：飛行日/時間/場所/機体/天候・風速/飛行概要/異常/操作。編集＝`DRONE_KEYS.editRequest` に id をセットして flight-log.html へ。削除＝confirm 後除去。
  - `#btn-csv`（第5.12形式）、`#btn-json`（`{app:'drone-flight-log',exportedAt,records:絞り込み結果}`）。
  - `#btn-import`（複数ファイル可）：`recordKey(r)`（id があれば `id:<id>`、無ければ `k|date|takeoff|aircraft|pilot`）で**後勝ち**マージ。`sortRecords` は「date+takeoff」→pilot→id 順。失敗ファイル名を報告。
  - `#btn-print`：`getFiltered()` を機体名でグループ化しA4横ページ分割。機体ヘッダ（機体名/JU番号/総飛行時間=繰越＋累積）＋様式１相当テーブル（No./飛行年月日/操縦者/離陸場所/着陸場所/離陸時刻/着陸時刻/飛行時間/総飛行時間/安全に影響した事項）。繰越・JU番号は機体管理 `getAircraftInfo()` から。
- **全データ（一括）**：`#btn-all-export`（`{app:'drone-all-data',version:1,exportedAt,data:{aircraft,plan,checklist,records}}`, `drone-all-data-YYYYMMDD.json`）。`#btn-all-import`：confirm 後、存在するセットだけ置換し再描画。`#btn-clear-all`：confirm 後、4キー＋旧キー（`drone-flight-log-header, drone-flight-log-meta, drone-checklist-state, drone-active-session`）を削除。
- 初期化：`renderPlan(); renderChecklist(); render();`（各 try/catch）。

### 7.7 飛行計算（calculator.html）
- 目的：参考算出3セクション＋法令簡易チェック。`.container{max-width:1100px}`。`<script src="flight-calc.js">` を先に読み込む。
- キー：`DRONE_KEYS.calcDraft`、`DRONE_KEYS.calcSummary`（ユーザー機体プリセットは flight-calc.js が `DRONE_KEYS.aircraftPresets` を使用）。
- 共通ヘルパ：`num(id)`（value を parseFloat、min/max 範囲外なら `.invalid` 付与し NaN 返す）、`show(id,v,digits=1)`（有限なら `toFixed`、不正なら「―」）。
- **セクション1 可能飛行時間・限界ホバリング**：
  - 入力：`ac-preset`(select)＋`ac-save`/`ac-delete`、`ft-mass, ft-payload, ft-rotors(4/6/8), ft-prop(inch), ft-cap, ft-volt(2S..12S), ft-fom, ft-eff, ft-health, ft-reserve(0.30/0.25/0.20), ft-cruise`。
  - 計算：`calcFlightTime({ totalMassKg: ft-mass + ft-payload, rotorCount: ft-rotors, propDiameterM: ft-prop*0.0254, figureOfMerit: ft-fom, driveEff: ft-eff, capacityMah: ft-cap, voltageV: ft-volt, reserveRatio: ft-reserve, batteryHealth: ft-health, cruiseFactor: ft-cruise })`。出力 `ft-out-flight`（分）, `ft-out-hover`（分）, `ft-out-power`（W,0桁）。flightTimeMin<5 で警告。
  - 実測比較 `updateActual()`：`flightLogStats(ac-preset)` の平均×回数、理論比%（<0.7 で劣化率見直し警告）。
  - `#btn-apply-plan`：結果4行を `drone-calc-summary` に保存し計画書へ誘導。
- **セクション2 目視可能の目安**：`dp-size`→`visualLineOfSightM`→`dp-out-vlos`（m,0桁）。下に**航空法簡易チェック** `#compliance-list`（`updateCompliance()`）。
  - 重量：総g＝(ft-mass+ft-payload)×1000。≥25000→NG（25kg区分）/≥100→警告（登録・リモートID）/未満→OK（規制対象外）。
  - 高度：`gs-alt`。>150→NG（個別許可）/>130→警告/>0→OK。
  - 目視外：`visualLineOfSightM(dp-size)` の距離超で目視外の注意。
  - 150m超で `gs-alt`、25kg以上で `ft-mass` に `.over-limit`（赤）。
- **セクション3 GSD・撮影範囲**：
  - 入力：`gs-sensor`（SENSOR_PRESETS から生成、既定 `4/3型(M4/3)`）、`gs-focal, gs-imgw, gs-imgh, gs-alt, gs-target, gs-front(前方ラップ%), gs-side(側方ラップ%)`。
  - 計算：`calcGsd(...)`→`gs-out-gsd`(cm/px,2桁。<1 なら mm/px 併記)、`gs-out-fp`「横W × 縦H m」、`gs-out-lap`「撮影間隔=footprintH×(1-front/100) ／ コース間隔=footprintW×(1-side/100)」、`altitudeForGsdM`→`gs-out-alt`（>150 で警告バナー）。
  - SVG図解 `updateViz()`：高度に応じて画角三角形・撮影範囲帯・高度寸法線・150m制限ラインを動的描画（縦横同一スケール）。
  - `#btn-copy-plan`：高度/GSD/撮影範囲/ラップ率をクリップボードへ（失敗時 textarea フォールバック）。ボタンに「✅ コピーしました」を2秒表示。
- **スライダー併用**：`SLIDER_DEFS`（`ft-mass:[0.1,10,0.01], ft-payload:[0,5,0.01], ft-cap:[500,20000,50], gs-alt:[1,200,1], gs-focal:[2,50,0.1], gs-target:[0.1,10,0.1], gs-front:[30,95,1], gs-side:[30,95,1]`）に対し、数値ボックス直下に `range` スライダー＋現在値バッジを生成し双方向同期。サム26px（グローブ対応）、ドラッグ中バッジ拡大。
- **プリセット**：`renderPresets()`（内蔵＋★ユーザー）、`applyPreset(name)`（`PRESET_FIELDS` のマッピングで各入力へ、rotors/最近傍電圧/sensor も設定）。`ac-save` は現在値を `drone-aircraft-presets-v2` へ（同名は置換）。`ac-delete` は内蔵削除不可。
- **自動保存**：全 input/select の `input` で `updateAll()`＋`saveDraft()`。
- 初期化順：`renderPresets(); loadDraft(); syncSliders(); updateAll();`。

---

## 8. 印刷／PDF 出力仕様（まとめ）

| 画面 | 帳票 | 用紙 | ページ分割 |
|---|---|---|---|
| flight-plan.html | ドローン飛行計画書 | A4縦 | 1枚 |
| checklist.html | 様式２ 日常点検記録＋飛行前確認＋特記事項 | A4縦 | 実施年月日の全件を登録記号ごと |
| flight-log.html | 様式１ 飛行記録 | A4横 | 選択日を登録記号ごと |
| data.html | 飛行日誌一覧（累積飛行時間付き） | A4横 | 機体ごと |

共通作法は第4.11。いずれもブラウザ印刷ダイアログで「PDFに保存」を選ぶ。印刷直前に `beforeprint` で印刷用DOMを再生成する（チェックリスト・日誌・データ管理）。

---

## 9. 国土交通省 様式 対応表

### 9.1 様式２（日常点検記録）— checklist.html 日常点検9項目
| `checks` キー | 点検箇所（和） | 英語（EN） | 点検内容（desc） |
|---|---|---|---|
| `uas_general` | 機体全般 | UAS GENERAL | 機器の取付状態（ネジ・コネクタ・ケーブル等） |
| `propeller` | プロペラ | PROPELLER(S) | 外観・損傷・歪み |
| `frame` | フレーム | FRAME | 外観・損傷・歪み |
| `communication_system` | 通信系統 | COMMUNICATION SYSTEM | 機体と操縦装置の通信品質の健全性 |
| `propulsion_system` | 推進系統 | PROPULSION SYSTEM | モーター又は発動機の健全性 |
| `power_system` | 電源系統 | POWER SYSTEM | 機体及び操縦装置の電源の健全性 |
| `automatic_control_system` | 自動制御系統 | AUTOMATIC CONTROL SYSTEM | 飛行制御装置の健全性 |
| `flight_control_system` | 操縦装置 | FLIGHT CONTROL SYSTEM | 外観、スティック、スイッチの健全性 |
| `battery_fuel` | バッテリー、燃料 | BATTERY, FUEL | バッテリーの充電状況、燃料表示性能の健全性 |

### 9.2 飛行前確認事項（独自追加6項目）
様式２に存在しない項目（外観点検・バッテリー残量・昼間飛行・目視内飛行）は採用しない。

| `checks` キー | 項目 | 補足表示 |
|---|---|---|
| `pilot_condition` | 操縦者の体調確認（飲酒・薬物なし） | － |
| `weather_check` | 気象状況の確認（風速・天候） | － |
| `airspace_check` | 飛行空域の確認（DID・150m制限・空港周辺など） | － |
| `surroundings_check` | 周囲の安全確認（第三者・障害物） | － |
| `special_application` | 特例申請の確認 | 包括/個別/承認の判断ガイド表 |
| `police_contact` | 地元警察への事前連絡 | 平日午後4時締切の警告ノート |

### 9.3 様式１（飛行記録）— flight-log.html / data.html
帳票列：飛行年月日(FLIGHT DATE) / 飛行させた者の氏名(NAME OF PILOT) / 飛行概要(NATURE OF FLIGHT) / 離陸場所(FROM) / 着陸場所(TO) / 離陸時刻(OFF) / 着陸時刻(ON) / 飛行時間(FLIGHT TIME) / 総飛行時間(TOTAL) / 飛行の安全に影響のあった事項(MATTERS AFFECTED FLIGHT SAFETY) / 確認者(CONFIRMER)。登録記号(REGISTRATION ID OF UAS)はページ見出し。

---

## 10. PWA / Service Worker / manifest

### 10.1 manifest.json（全内容）
```json
{
  "name": "ドローン運用ツール",
  "short_name": "ドローン運用",
  "description": "飛行計画書・飛行計算・チェックリスト・飛行日誌・データ管理",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#F5F3EC",
  "theme_color": "#25364A",
  "lang": "ja",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```
アイコンは PNG 2サイズ（192/512）。色は theme と一致（bg=#F5F3EC, theme=#25364A）。

### 10.2 sw.js（全内容と方針）
- `CACHE_NAME = 'drone-tools-vN'`。`N` はキャッシュ更新ごとに増やす運用値で、再構築時の初期値は任意（例 `v1`）。**キャッシュ対象を変更したら必ずバージョン番号を上げる**（上げ忘れると利用者端末に旧画面が残る）。現行値は `sw.js` を正とする。
- `ASSETS`（キャッシュ対象。相対パス）：
  ```
  './', './theme.css', './index.html', './aircraft.html', './flight-plan.html',
  './calculator.html', './checklist.html', './flight-log.html', './data.html',
  './userguide.html', './storage-keys.js', './flight-calc.js',
  './manifest.json', './icon-192.png', './icon-512.png'
  ```
- `install`：`caches.open(CACHE_NAME).addAll(ASSETS)` → `skipWaiting()`。
- `activate`：旧キャッシュ削除 → `clients.claim()`。
- `fetch`（**stale-while-revalidate**）：GET のみ。`caches.match` を即返しつつ裏で `fetch` し、`res.ok` かつ同一オリジンならキャッシュ更新。オフライン時は cached を返す。
```js
const CACHE_NAME = 'drone-tools-vN'; // N は更新ごとに増やす。初期値は任意
const ASSETS = [ /* 上記 */ ];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(cached => {
    const fetched = fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => cached);
    return cached || fetched;
  }));
});
```

---

## 11. ビルド・ローカル確認・配備

### 11.1 ビルド
ビルド工程は**ない**。ファイルをそのまま配置するだけで動作する。

### 11.2 ローカル確認
`file://` では Service Worker・一部機能が動かないため、簡易HTTPサーバを使う。
- Windows（PowerShell）：`python -m http.server 8080`
- Mac：`python3 -m http.server 8080`
- ブラウザで `http://localhost:8080` を開く。

### 11.3 配備（GitHub Pages）
- リポジトリのルートに全ファイルを置き、GitHub Pages を有効化（ブランチのルートを公開）。公開URL例：`https://<user>.github.io/<repo>/`。
- 相対パス（`./`）構成のためサブパス公開でも動作する。
- 更新時、キャッシュ対象を変更したら `sw.js` の `CACHE_NAME` を必ず上げる。

### 11.4 マルチマシン運用ルール（運用上の注意）
複数マシン（Windows×2・Mac）で作業し GitHub をハブに同期する場合：
- 作業開始時に必ず `git pull`。
- 作業終了時にその場で `git add . && git commit && git push`。
- 鉄則：始める前に pull、終わったら push。別マシンへ移る前に必ず push（push 忘れは競合の原因）。

---

## 12. 制約事項・既知の仕様

- **データはブラウザ内のみ**：キャッシュ削除・別端末/別ブラウザ・プライベートモードでは引き継がれない。定期的な「全データJSON出力」を必須案内とする。日誌は3年保存が求められる。
- **localStorage 警告について**：通常利用では発生しない。報告される警告はプライベートモード／サイトデータ・Cookieブロック設定／広告ブロック拡張／容量上限など環境固有事象。localStorage を使わないとブラウザを閉じた時点でデータ消失するため代替しない。「通常モードで開き、サイトデータ保存を許可」「こまめに全データJSON出力」と案内する。
- **機体の紐付けは機体名の文字列一致**：機体名の変更・重複に注意。
- **算出値はすべて参考値**：飛行時間・GSD・目視可能距離・法令簡易判定は最終判断の根拠にしない。最新の航空法・MLIT・DIPS を別途確認すること。
- **記事（SQUAWK）は当面非表示**：日誌のコード上はコメントアウトで残置。将来有効化を想定。

---

## 13. 今後の拡張に向けた留意点

- 計画書の複数管理は将来対応予定（現在は下書き1件）。データ構造（キー設計）は拡張しやすい形を維持する。
- クラウド同期・複数アカウント対応を検討する場合は、localStorage キーの互換維持またはマイグレーション方針を別途設計する。
- 機能を変更したら、本書（specification.md）と `userguide.html` を必ず同時更新する。UI 変更は `DESIGN-GUIDELINES.md` に従う。
- キャッシュ対象ファイルの増減・改名時は `sw.js` の `ASSETS` 更新と `CACHE_NAME` のバージョンアップを忘れない。
