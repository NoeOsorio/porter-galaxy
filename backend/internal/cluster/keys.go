package cluster

// State is the health of an object as drawn by the frontend. The same values
// are defined in frontend/src/lib/objectKey.ts; change both together.
type State string

const (
	StateRunning      State = "running"
	StatePending      State = "pending"
	StateCompleted    State = "completed"
	StateFailed       State = "failed"
	StateScaledToZero State = "scaled-to-zero"
	StateUnknown      State = "unknown"
)

// internetKey is the single synthetic source of all external traffic links.
const internetKey = "internet/_/internet"

// objectKey identifies an object within a cluster as kind/namespace/name.
// Cluster-scoped objects use "_" as the namespace so every key has three parts.
func objectKey(kind, namespace, name string) string {
	if namespace == "" {
		namespace = "_"
	}
	return kind + "/" + namespace + "/" + name
}
