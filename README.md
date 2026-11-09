# PLaMo PDF Translator

英語 PDF の原文と日本語訳を左右に表示する Windows アプリ

表示中のページを PLaMo 3 Translate 0.8B でローカル翻訳します

![PDF の原文と日本語訳](docs/translation.png)

## ビルド

Windows x64 向けのビルドには次のツールが必要です

- Node.js 22.13 以上と pnpm 9.14.4
- Rust 1.90 以上の MSVC ツールチェーン
- Visual Studio Build Tools の「C++ によるデスクトップ開発」と Windows SDK
- CMake と LLVM の libclang

`libclang.dll` が見つからない場合は `LIBCLANG_PATH` にそのフォルダを設定してください

```powershell
git clone https://github.com/matsuvr/side_by_side_pdf_translator.git
cd side_by_side_pdf_translator
pnpm install --frozen-lockfile
pnpm build
```

インストーラーの出力先は `src-tauri/target/release/bundle/nsis/`

Windows での実行には WebView2 Runtime と Visual C++ 再頒布可能パッケージ x64 が必要です

[WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) · [Visual C++ 再頒布可能パッケージ](https://learn.microsoft.com/ja-jp/cpp/windows/latest-supported-vc-redist)

## モデルと PDF を開く

1. 起動画面の「GGUFモデルをダウンロード」から `plamo-3-translate-0.8b-Q4_K_M.gguf` を取得
2. 「フォルダを開く」で表示した配置先に保存して「再スキャン」
3. 「PDFを開く」またはドラッグ＆ドロップで読み込み
4. 左右の矢印キーでページ移動

モデルの配布元は Preferred Networks です

画像だけのページの OCR には対応していません

## 開発

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | Tauri の開発モードで起動 |
| `pnpm typecheck` | TypeScript の型チェック |
| `node scripts/msvc.mjs cargo test --locked --manifest-path src-tauri/Cargo.toml` | Rust のテスト |
| `pnpm smoke` | プロジェクト直下の GGUF で翻訳を確認 |
| `pnpm build:release` | CPU 版の実行ファイルを作成 |
| `pnpm build:cuda` | CUDA Toolkit を使用して NVIDIA GPU 向けにビルド |

Vulkan SDK を使う場合は `node scripts/msvc.mjs tauri build --no-bundle --features vulkan`

macOS で Metal を使う場合は `pnpm exec tauri build --bundles app --features metal`

動作確認済みの構成は Windows x64 の CPU 版です

開発時のモデル配置先はプロジェクト直下

配布版の配置先は実行ファイルと同じフォルダです

実行ファイルを単体で配布する場合は `LICENSE` と `THIRD_PARTY_NOTICES.md` と `THIRD_PARTY_LICENSES.txt` を添付してください

## ライセンス

アプリ本体は [MIT License](LICENSE)

依存ライブラリの利用条件は [Third-party notices](THIRD_PARTY_NOTICES.md) に記載しています

モデルの取得と利用には Preferred Networks の条件が適用されます

[モデルカード](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF) · [PLaMo Community License](https://plamo.preferredai.jp/info/plamo-community-license-ja)
