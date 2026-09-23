.PHONY: check quality format-check lint test build audit deny check-generated contract
check: quality audit deny check-generated
quality: format-check lint test build
format-check:
	cargo fmt --all -- --check
lint:
	cargo clippy --release --workspace --all-targets --all-features --locked -- -D warnings
test:
	cargo test --release --workspace --all-features --locked
build:
	cargo build --release --locked
audit:
	cargo-audit audit
deny:
	cargo-deny check
check-generated:
	python3 ../tools/contract.py check
contract:
	cargo test --release --locked --test health
	python3 ../tools/contract.py check
