# Schema ownership

The Go domain package is the executable source of truth for runtime validation. The OpenAPI document in `packages/contracts` is the transport contract. Shared generated schemas can be added here when generation is introduced, but hand-maintained duplicate model definitions should be avoided.
