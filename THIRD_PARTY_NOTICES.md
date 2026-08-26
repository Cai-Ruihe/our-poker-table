# Third-party notices

The Phase 1 Table-side build bundles React, QR generation/decoding, compression, and Archivo font dependencies; the Connection Service adds `ws`. Their locked production package names, versions, and declared licences are inspectable with `pnpm licenses:prod`.

The human-readable [distribution licence bundle](apps/web/public/THIRD-PARTY-LICENSES.txt) is source-controlled under the web application's public assets, copied into every Table-side build, and embedded into the generated Airplane file. Dependency or asset changes must update that bundle and its attribution inventory before release; package metadata alone is not sufficient evidence that a distributable contains required notices.

The project-owned [LICENSE](LICENSE) and [NOTICE](NOTICE) remain part of every source/release package. In particular, the current QR fallback includes Apache-2.0 components whose full license terms are provided by `LICENSE`; a releaser must retain it alongside the artifact package.
