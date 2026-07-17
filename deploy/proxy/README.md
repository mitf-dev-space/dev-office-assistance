# Reverse proxy (deferred)

LAN v1 publishes web `:46810` and API `:46811` directly on `10.100.235.21`.

When a public domain and TLS are required, place Caddy or nginx configs here and terminate TLS in front of the compose stack. Do not enable until certificates and DNS are ready.

See [docs/domain-and-tls.md](../../docs/domain-and-tls.md).
