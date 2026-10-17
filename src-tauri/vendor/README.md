# GTK 3 security backport

Tauri's Linux runtime uses GTK 3 and GLib's Rust bindings 0.18. Upgrading only
`glib` to 0.20 cannot replace that dependency without breaking the GTK ABI/type
chain. This directory carries the original published `glib 0.18.5` source with
one compatibility backport for [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).

`gtk-compat.patch` contains the entire change: the output pointer passed to
`g_variant_get_child` is mutable and passed by mutable reference. This follows
[the upstream fix](https://github.com/gtk-rs/gtk-rs-core/pull/1343) and prevents
undefined behavior / null dereferences in optimized string-variant iteration.
The package version and GTK interface are unchanged. Upstream copyright and MIT
license are retained in `glib/COPYRIGHT` and `glib/LICENSE`.

`upstream-checksums.json` records the SHA-256 of the original crates.io archive
(verified against the original Cargo.lock before extraction) and every published
file. `python3 scripts/check-vendored-gtk.py` reverses the documented patch in a
temporary copy and checks every file against those upstream hashes. CI also
checks that Cargo selected the patched package. Any later change requires an
explicit patch/provenance update, rather than an unnoticed edit to copied code.

`src-tauri/tests/gtk_security.rs` exercises forward, reverse, indexed, last,
mixed and empty string-array iteration. Linux build and release workflows run it
with `--release`, since compiler optimization exposes the original bug. Full
packaging and native acceptance must pass before shipping the backport.

Cargo's registry auditor does not assess local path packages against upstream
advisories. `python3 scripts/audit-rust.py` restores the original registry version
and archive checksum in a temporary audit lockfile, so future advisories for the
vendored version are still detected. It reports this single verified backport
separately after checking the complete source hashes, fails on any vulnerability
or other unsoundness, and keeps maintenance warnings visible. The real lockfile
is never modified. The provenance and optimized behavioral checks are mandatory;
do not remove them simply to make an audit green.

Remove this override when Tauri's supported GTK stack includes the upstream fix.
Until then, this project owns the small backport and must review new GLib
advisories and upstream 0.18 changes. This does not claim that all potential GLib
issues are fixed.
