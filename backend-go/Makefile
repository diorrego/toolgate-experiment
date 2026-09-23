.PHONY: check quality format-check vet test race lint audit build contract check-generated
check: quality check-generated
quality: format-check vet test race lint audit build
format-check:
	@files="$$(gofmt -l cmd internal)" || exit $$?; test -z "$$files" || { printf '%s\n' "$$files"; exit 1; }
vet:
	go vet ./...
test:
	go test -count=1 ./...
race:
	go test -race -count=1 ./...
lint:
	go run honnef.co/go/tools/cmd/staticcheck@v0.8.1 ./...
audit:
	go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...
build:
	go build -trimpath -o bin/toolgate ./cmd/toolgate
check-generated:
	python3 ../tools/contract.py check
contract:
	go test -count=1 ./internal/httpapi
	python3 ../tools/contract.py check
