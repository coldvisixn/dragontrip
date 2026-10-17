//! Exercise the actual GTK 3 GLib dependency in optimized builds, where the old
//! immutable out-pointer was optimized away (RUSTSEC-2024-0429).

use glib::variant::ToVariant;

#[test]
fn string_variant_iteration_is_valid_in_optimized_builds() {
    let strings = ["first", "second", "third", "четвёртый"];
    let variant = strings.to_variant();
    assert_eq!(
        variant.array_iter_str().unwrap().collect::<Vec<_>>(),
        strings
    );
    assert_eq!(variant.array_iter_str().unwrap().next(), Some("first"));
    assert_eq!(variant.array_iter_str().unwrap().nth(1), Some("second"));
    assert_eq!(variant.array_iter_str().unwrap().last(), Some("четвёртый"));
    assert_eq!(
        variant.array_iter_str().unwrap().next_back(),
        Some("четвёртый")
    );
    assert_eq!(variant.array_iter_str().unwrap().nth_back(1), Some("third"));
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next(), Some("first"));
    assert_eq!(iter.next_back(), Some("четвёртый"));
    assert_eq!(iter.collect::<Vec<_>>(), ["second", "third"]);
}

#[test]
fn empty_string_variants_are_fused() {
    let variant = Vec::<String>::new().to_variant();
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next(), None);
    assert_eq!(iter.next_back(), None);
    assert_eq!(iter.next(), None);
}
