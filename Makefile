.PHONY: check unit integration build report-check
check:
	python3 tools/contract.py check
	python3 tools/check-repository.py
	$(MAKE) report-check
	$(MAKE) -C backend-go check
	$(MAKE) -C backend-rust check
	cd sdk-typescript && npm run check
	$(MAKE) unit
unit:
	python3 -m unittest discover -s tools/tests
	node --test tools/tests/*.test.mjs
integration:
	node tools/pack-sdk.mjs
	python3 tools/core-conformance.py go --sdk
	python3 tools/core-conformance.py rust --sdk
	python3 tools/binary-conformance.py go
	python3 tools/binary-conformance.py rust
build:
	$(MAKE) -C backend-go build
	$(MAKE) -C backend-rust build
	cd sdk-typescript && npm run build
report-check:
	python3 tools/check-results.py
	python3 tools/check-results.py --name binary
	node tools/v2/analyze.mjs --check
	node tools/v3/analyze.mjs --check
