fn main() {
    tauri_build::build();

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")
        && std::env::var_os("CARGO_FEATURE_METAL").is_some()
    {
        // llama.cpp's Objective-C availability checks need Clang's runtime.
        // Rust links with -nodefaultlibs, so the Clang driver does not add it.
        let output = std::process::Command::new("xcrun")
            .args(["--sdk", "macosx", "clang", "--print-runtime-dir"])
            .output()
            .expect("Xcode Command Line Tools are required for Metal builds");
        assert!(output.status.success(), "could not locate Clang's runtime");
        let runtime_dir =
            String::from_utf8(output.stdout).expect("Clang runtime path is not UTF-8");
        let runtime_dir = runtime_dir.trim();
        assert!(
            std::path::Path::new(runtime_dir)
                .join("libclang_rt.osx.a")
                .is_file(),
            "libclang_rt.osx.a is missing from the selected Xcode toolchain"
        );
        println!("cargo:rustc-link-search=native={runtime_dir}");
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
    }
}
