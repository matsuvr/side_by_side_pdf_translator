# macOS 動作確認

2026-11-09 に Apple Silicon Mac 上でビルドと実アプリの動作を確認した。

## 環境と入力

| 項目 | 内容 |
| --- | --- |
| OS / CPU | macOS 27.2 (26B123) / Apple M4 |
| ビルド | arm64、release、Metal 有効 |
| Node.js / pnpm | 24.13.0 / 9.14.4 |
| Rust / CMake | 1.99.1 / 3.31.6 |
| コンパイラ | Xcode の Apple Clang 21.0.0 |
| ソース | `a040ab055f7a52d867979707a7da7dc5107bc17e` に今回の変更を適用 |
| モデル | プロジェクト直下の `plamo-3-translate-0.8b-Q4_K_M.gguf` |
| PDF | `docs/1706.03762v7.pdf`、15ページ |

GGUF と PDF は既存の `.gitignore` によって除外され、Git で追跡されていない。元ファイルは移動・編集していない。抽出テキストと実行ログも Git 対象外の `build/validation/` に保存した。

## 結果

| 確認項目 | 結果 |
| --- | --- |
| 固定 lockfile による Metal 対応 `.app` ビルド | 成功 |
| TypeScript 型チェック / Vite 本番ビルド | 成功 |
| Rust テスト (`--release --locked --offline --features metal`) | 7件成功、失敗0件 |
| アプリのテキスト抽出関数による全15ページの抽出 | 全ページで空でないテキストを取得 |
| モデル未配置時の案内 | 配置先と再スキャン操作を表示 |
| GGUF の再スキャン / 再起動時の自動検出 | 成功、`MTL · Apple M4` を表示 |
| PDF の読み込みと左右表示 | 成功、15ページと認識 |
| 1・2・3・15ページ目の常体翻訳 | すべて完了 |
| 図の描画 | 3・15ページ目の図を実画面で確認 |
| 文体切替 | 3ページ目を敬体で再翻訳し、常体に戻すとキャッシュから復元 |
| ページ操作 | 次ページボタン、右矢印キー、ページ番号入力が動作 |
| 翻訳開始後のページ切替 | 4ページ目から15ページ目へ移動し、移動先の訳文が完了することを確認 |
| 拡大 / リセット | 100% → 110% → 100% を確認 |
| 訳文コピー | 「コピー済み」表示を確認 |
| 終了 / 再起動 | 正常終了し、完成版でPDFを開き直して再翻訳できた |
| `.app` 検査 | arm64、ad-hoc 署名、`codesign --verify --deep --strict` 成功 |

画面に表示された翻訳時間の実測値（各1回、ベンチマークではない）:

| ページ / 文体 | 出力文字数 | 時間 |
| --- | ---: | ---: |
| 1 / 常体 | 1,522 | 5.2秒（再起動後5.3秒） |
| 2 / 常体 | 2,004 | 7.9秒 |
| 3 / 常体 | 876 | 3.4秒 |
| 3 / 敬体 | 890 | 3.3秒 |
| 15 / 常体 | 141 | 0.6秒 |

追加で、1ページ目の抽出テキスト全体を既存の `smoke` example に渡して Metal 推論の正常終了と全文出力を確認した。CLI のコンテキスト長は4,096、アプリは16,384のため、CLIの処理時間は上表と比較していない。画面検査ツールの長文取得では段落末尾が省略されたが、実画面とCLI出力の双方で該当文末まで存在することを確認した。

## ビルド時の修正

初回の Metal ビルドは `___isPlatformVersionAtLeast` の未解決シンボルでリンクに失敗した。`src-tauri/build.rs` で macOS の Metal ビルド時に、選択中の Xcode から Clang ランタイムの場所を取得し、`libclang_rt.osx.a` を静的リンクするよう修正した。Windows のビルド経路には適用されない。

`pnpm build:mac` を追加し、このコマンドでのビルド成功も確認した。

このMacにあるRustツールチェーンでは `rust-objcopy` が `libLLVM.dylib` を見つけられず、デバッグ情報削除の警告が出たが、ビルド自体は成功した。完成版にはシステムの `strip -S` を適用してから ad-hoc 署名した。元のRustツールチェーン設定は変更していない。

## 完成版と再実行

- 完成版: `build/macos/PLaMo PDF Translator.app`
- モデル参照: `build/macos/plamo-3-translate-0.8b-Q4_K_M.gguf` → プロジェクト直下の既存GGUF（相対シンボリックリンク）
- ビルドログ: `build/validation/macos-build.log`
- Rust テスト: `build/validation/rust-tests.log`
- 全ページ抽出結果: `build/validation/pdf-extraction.json`
- CLI 推論結果: `build/validation/page-1-smoke.log`
- 入力と完成版実行ファイルのSHA-256: `build/validation/input-sha256.txt`、`build/validation/app-sha256.txt`

一般的なビルド手順は README の macOS 節を参照。この作業では不足していた pnpm / CMake と Cargo キャッシュをプロジェクト内に用意し、既存のRustツールチェーンを直接指定した。このMacの同じ環境では以下で再実行できる。

```sh
sh build/macos-env.sh pnpm build:mac -- --locked --offline
sh build/macos-env.sh cargo test --release --locked --offline --manifest-path src-tauri/Cargo.toml --features metal
node build/validation/extract-pdf.mjs
```

別フォルダへアプリを移す場合、GGUFの実ファイルも `.app` と同じフォルダへ配置する必要がある。

## 検証範囲

全15ページのテキスト抽出を確認したが、全ページの翻訳・対訳の監修は行っていない。長時間連続使用、Intel Mac、旧版macOS、画像のみのPDF、ドラッグ＆ドロップは今回未検証。Developer ID 署名・公証・他のMacでのGatekeeper確認は行っていない。
