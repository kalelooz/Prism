# Native package license supplements

These unchanged texts fill gaps in the published Cargo archives. `native-notices.mjs` reads the remaining licenses from the exact packages in `Cargo.lock` and includes the Rust toolchain's standard-library attribution document in the built app. These files do not change Prism's MIT license.

| Component | Source for the text |
| --- | --- |
| alloc-stdlib 0.2.4 | [Upstream LICENSE at the crate's recorded commit](https://github.com/dropbox/rust-alloc-no-stdlib/blob/ae42d22078b98549e987d2f03d12df7b984fde47/LICENSE) |
| clipboard-win 5.4.1 | [Upstream LICENSE at the crate's recorded commit](https://github.com/DoumanAsh/clipboard-win/blob/3b27cf2bfd1adcfa6e0264eb51c1025ddaf0f342/LICENSE) |
| selectors 0.36.1 | [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/); [unmodified component source](https://crates.io/crates/selectors/0.36.1) |
| unic-* 0.9.0 | [MIT](https://github.com/open-i18n/rust-unic/blob/5878605364af97a3358368a6eaef02104af2e016/LICENSE-MIT) and [Apache](https://github.com/open-i18n/rust-unic/blob/5878605364af97a3358368a6eaef02104af2e016/LICENSE-APACHE) at the crate's recorded commit |
| webview2-com and webview2-com-sys 0.38.2 | [Upstream LICENSE at the crate's recorded commit](https://github.com/wravery/webview2-rs/blob/b74dc5e2b394044bea5191052868ce7a106c202c/LICENSE) |
| webview2-com-macros 0.8.1 | [Upstream LICENSE at the crate's recorded commit](https://github.com/wravery/webview2-rs/blob/dffa41a8a46d3f5565eefbff2de57d38d399f158/LICENSE) |
| Microsoft WebView2 SDK 1.0.3650.58 loader | [Official package license](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3650.58/License). The SDK version is recorded by webview2-com-sys 0.38.2's changelog and loader file metadata. |
