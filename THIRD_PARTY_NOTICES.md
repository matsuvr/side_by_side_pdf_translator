# Third-party notices

PLaMo PDF Translator is an independent application. Its own source is licensed under the [MIT License](LICENSE). The application's MIT License does not apply to the model weights. Application bundles include the application license, this notice, the dependency license texts and the full PLaMo Community License in their `licenses` resources directory. Release ZIPs also include readable copies beside the application. Preserve these documents when redistributing.

## Model

Built with PLaMo

Release ZIPs include the unmodified official `plamo-3-translate-0.8b-Q4_K_M.gguf` from Preferred Networks' `pfnet/plamo-3-translate-0.8b-GGUF` repository. Model weights are excluded from Git and are distributed only as release ZIP contents. The source build does not automatically download or bundle weights.

The model is licensed separately under the PLaMo Community License. The complete Japanese and English agreements, revised November 9, 2026, are reproduced without modification in [Japanese](licenses/PLAMO_COMMUNITY_LICENSE-ja.txt), [English](licenses/PLAMO_COMMUNITY_LICENSE-en.txt), and [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt). The startup screen opens the local Japanese agreement without internet access. [Model and license provenance](licenses/README.md) · [Pinned model revision and SHA-256](licenses/plamo-model.json)

Users must comply with the full agreement. Personal and non-commercial use, including academic use, is free without prior registration. Commercial use, including internal business use, requires prior PFN registration when the user or its affiliates' revenue or sales in the most recent fiscal year does not exceed JPY 1 billion; a separate commercial license is required above that threshold. Redistribution requires providing the agreement, requiring recipients to comply, and displaying “Built with PLaMo”; Article 4 also governs derived models and other applicable licenses. Article 5 covers attribution for substantial long-form publications of translations, models trained on outputs, and notices when providing outputs or datasets to third parties. The full agreement also sets age requirements, prohibited uses, responsibilities and warranty limitations. This summary does not replace the agreement.

[Official model card](https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF#license) · [PFN commercial registration](https://forms.gle/mTL8tBLrMYXKNZD56) · [Japanese license website](https://plamo.preferredai.jp/info/plamo-community-license-ja) · [English license website](https://plamo.preferredai.jp/info/plamo-community-license-en)

## Application dependencies

| Component | Locked version | Declared license |
| --- | --- | --- |
| [React and React DOM](https://github.com/facebook/react) | 19.3.1 | MIT |
| [Blueprint core and icons](https://github.com/palantir/blueprint) including icon fonts | 6.22.0 / 6.15.0 | Apache-2.0 |
| [PDF.js](https://github.com/mozilla/pdf.js) browser build and worker | 6.5.438 | Apache-2.0 |
| [Tauri JavaScript API](https://github.com/tauri-apps/tauri) | 2.12.4 | Apache-2.0 OR MIT |
| [Tauri](https://github.com/tauri-apps/tauri) | 2.12.5 | Apache-2.0 OR MIT |
| [Tauri single-instance plugin](https://github.com/tauri-apps/plugins-workspace) | 2.5.5 | Apache-2.0 OR MIT |
| [Serde](https://github.com/serde-rs/serde) | 1.0.229 | MIT OR Apache-2.0 |
| [open](https://github.com/Byron/open-rs) | 5.4.5 | MIT |
| [llama-cpp-2 and llama-cpp-sys-2](https://github.com/utilityai/llama-cpp-rs) | 0.1.161 | MIT OR Apache-2.0 |
| [llama.cpp and ggml](https://github.com/ggml-org/llama.cpp) | sources vendored in llama-cpp-sys-2 0.1.161 | MIT with separate notices for bundled components |

PDF.js carries copyright notices from the Mozilla Foundation. Blueprint carries copyright notices from Palantir Technologies. The native inference code includes work by the ggml authors. Upstream license and attribution texts are reproduced in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt).

The Windows backend uses the Microsoft WebView2 SDK loader from the webview2-com-sys crate. The SDK license (BSD-3-Clause) and its NOTICE are included with the dependency texts. The system WebView2 Runtime and Visual C++ runtime libraries are supplied separately by Microsoft. [SDK 1.0.3800.47](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3800.47) · [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) · [Visual C++ Redistributable](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)

## Development dependencies

| Component | Locked version | Declared license |
| --- | --- | --- |
| Tauri CLI / tauri-build | 2.12.4 / 2.7.4 | Apache-2.0 OR MIT |
| Vite / Vite React plugin | 8.3.6 / 6.2.1 | MIT |
| TypeScript | 5.9.3 | Apache-2.0 |
| React and React DOM type definitions | 19.3.0 | MIT |
| bindgen | 0.72.1 | BSD-3-Clause |

The inventory covers packages in [pnpm-lock.yaml](pnpm-lock.yaml) and [Cargo.lock](src-tauri/Cargo.lock), including build tools and target-specific dependencies. Each entry identifies the exact source distribution. For MPL-2.0 components such as `cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext` and `selectors`, the corresponding unmodified source is available from the versioned crate links in that inventory. [Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/)

The optional icon-generation script uses [Pillow](https://github.com/python-pillow/Pillow) under the [MIT-CMU license](https://github.com/python-pillow/Pillow/blob/main/LICENSE). The app and its build scripts use pre-generated icons.
