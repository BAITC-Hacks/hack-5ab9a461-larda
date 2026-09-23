// Package migrations bundles authoritative SQL migrations into the executable.
package migrations

import "embed"

//go:embed *.up.sql
var Files embed.FS
