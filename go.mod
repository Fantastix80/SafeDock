module github.com/safedock/safedock

go 1.22

require (
	github.com/docker/docker v24.0.9+incompatible
	github.com/glebarez/go-sqlite v1.22.0
	golang.org/x/crypto v0.31.0
)

require (
	github.com/Microsoft/go-winio v0.6.2 // indirect
	github.com/distribution/reference v0.6.0 // indirect
	github.com/docker/distribution v2.8.3+incompatible // indirect
	github.com/docker/go-connections v0.5.0 // indirect
	github.com/docker/go-units v0.5.0 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/gogo/protobuf v1.3.2 // indirect
	github.com/google/uuid v1.5.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/moby/term v0.5.2 // indirect
	github.com/morikuni/aec v1.1.0 // indirect
	github.com/opencontainers/go-digest v1.0.0 // indirect
	github.com/opencontainers/image-spec v1.1.0 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/sys v0.28.0 // indirect
	golang.org/x/time v0.0.0-00010101000000-000000000000 // indirect
	gotest.tools/v3 v3.5.2 // indirect
	modernc.org/libc v1.37.6 // indirect
	modernc.org/mathutil v1.6.0 // indirect
	modernc.org/memory v1.7.2 // indirect
	modernc.org/sqlite v1.28.0 // indirect
)

replace (
	github.com/distribution/reference => github.com/distribution/reference v0.5.0
	golang.org/x/time => golang.org/x/time v0.5.0
)
