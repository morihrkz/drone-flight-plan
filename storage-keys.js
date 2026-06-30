// storage-keys.js
// localStorage キー と エクスポート書式識別子の「単一の正本」。
//
// 各ページはこのファイルを <script> で読み込み、キー文字列を直書きせず
// DRONE_KEYS / DRONE_FORMATS 経由で参照する。
// これにより、キー名の表記ゆれ・タイプミスによるページ間データ不整合を防ぐ。
//
// 注意:
// - 既存ユーザーのデータと互換を保つため、ここの文字列は安易に変更しない
//   （変更すると保存済みデータが読めなくなる）。
// - このファイルは sw.js の ASSETS に含めること（追加時は CACHE_NAME を上げる）。

// localStorage に保存するキー（永続データ）。
const DRONE_KEYS = {
  // 機体管理
  aircraftList:         'drone-aircraft-list',
  // 飛行計画書
  flightPlanDraft:      'drone-flight-plan-draft',
  // チェックリスト
  checklistRecords:     'drone-checklist-records',
  // 飛行日誌
  flightLogRecords:     'drone-flight-log-records',
  // 計算機（ドラフト・結果サマリ・ユーザー機体プリセット）
  calcDraft:            'drone-calc-draft',
  calcSummary:          'drone-calc-summary',
  aircraftPresets:      'drone-aircraft-presets-v2',
  // セッション・ページ間連携
  activeSession:        'drone-active-session',
  checklistEditRequest: 'drone-checklist-edit-request',
  editRequest:          'drone-edit-request',
  // 補助・レガシー（主に全消去でのクリーンアップ対象）
  flightLogHeader:      'drone-flight-log-header',
  flightLogMeta:        'drone-flight-log-meta',
  checklistState:       'drone-checklist-state',
};

// エクスポート JSON の app フィールド（書き込み専用の書式識別子）。
const DRONE_FORMATS = {
  aircraft:    'drone-aircraft',
  flightPlan:  'drone-flight-plan',
  checklist:   'drone-checklist',
  flightLog:   'drone-flight-log',
  dailyRecord: 'drone-daily-record',
  allData:     'drone-all-data',
};
