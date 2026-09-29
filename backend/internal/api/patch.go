package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"slices"

	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
)

// indexed is a snapshot split into per-object JSON so consecutive snapshots can
// be compared object by object (contracts/stream.md).
type indexed struct {
	order    []string
	clusters map[string]*indexedCluster
}

type indexedCluster struct {
	raw    json.RawMessage
	fields map[string]json.RawMessage
	lists  map[string]*indexedList
}

type indexedList struct {
	keys  []string
	items map[string]json.RawMessage
}

type clusterPatch struct {
	ID     string                       `json:"id"`
	Upsert map[string][]json.RawMessage `json:"upsert,omitempty"`
	Remove map[string][]string          `json:"remove,omitempty"`
	Fields map[string]json.RawMessage   `json:"fields,omitempty"`
}

type patch struct {
	Base            uint64            `json:"base"`
	Version         uint64            `json:"version"`
	Clusters        []clusterPatch    `json:"clusters"`
	AddedClusters   []json.RawMessage `json:"addedClusters"`
	RemovedClusters []string          `json:"removedClusters"`
}

func (p *patch) empty() bool {
	return len(p.Clusters) == 0 && len(p.AddedClusters) == 0 && len(p.RemovedClusters) == 0
}

func index(s cluster.Snapshot) (*indexed, error) {
	out := &indexed{clusters: make(map[string]*indexedCluster, len(s.Clusters))}
	for _, c := range s.Clusters {
		raw, err := json.Marshal(c)
		if err != nil {
			return nil, err
		}
		var top map[string]json.RawMessage
		if err := json.Unmarshal(raw, &top); err != nil {
			return nil, err
		}
		ic := &indexedCluster{raw: raw, fields: map[string]json.RawMessage{}, lists: map[string]*indexedList{}}
		for name, value := range top {
			if name == "id" {
				continue
			}
			if !bytes.HasPrefix(value, []byte("[")) {
				ic.fields[name] = value
				continue
			}
			list, err := indexList(value)
			if err != nil {
				return nil, fmt.Errorf("cluster %s list %s: %w", c.ID, name, err)
			}
			ic.lists[name] = list
		}
		out.order = append(out.order, c.ID)
		out.clusters[c.ID] = ic
	}
	return out, nil
}

func indexList(value json.RawMessage) (*indexedList, error) {
	var items []json.RawMessage
	if err := json.Unmarshal(value, &items); err != nil {
		return nil, err
	}
	list := &indexedList{items: make(map[string]json.RawMessage, len(items))}
	for _, item := range items {
		var id struct{ Key, From, To string }
		if err := json.Unmarshal(item, &id); err != nil {
			return nil, err
		}
		k := id.Key
		if k == "" {
			k = id.From + "|" + id.To
		}
		if _, dup := list.items[k]; dup {
			continue
		}
		list.keys = append(list.keys, k)
		list.items[k] = item
	}
	return list, nil
}

func diff(prev, next *indexed) *patch {
	p := &patch{Clusters: []clusterPatch{}, AddedClusters: []json.RawMessage{}, RemovedClusters: []string{}}
	for _, id := range prev.order {
		if _, ok := next.clusters[id]; !ok {
			p.RemovedClusters = append(p.RemovedClusters, id)
		}
	}
	for _, id := range next.order {
		n := next.clusters[id]
		o, ok := prev.clusters[id]
		if !ok {
			p.AddedClusters = append(p.AddedClusters, n.raw)
			continue
		}
		if bytes.Equal(o.raw, n.raw) {
			continue
		}
		if cp := diffCluster(id, o, n); cp != nil {
			p.Clusters = append(p.Clusters, *cp)
		}
	}
	return p
}

func diffCluster(id string, o, n *indexedCluster) *clusterPatch {
	cp := &clusterPatch{ID: id, Upsert: map[string][]json.RawMessage{}, Remove: map[string][]string{}, Fields: map[string]json.RawMessage{}}
	for name, value := range n.fields {
		if !bytes.Equal(o.fields[name], value) {
			cp.Fields[name] = value
		}
	}
	for name, nl := range n.lists {
		ol := o.lists[name]
		if ol == nil {
			ol = &indexedList{}
		}
		for _, k := range nl.keys {
			if !bytes.Equal(ol.items[k], nl.items[k]) {
				cp.Upsert[name] = append(cp.Upsert[name], nl.items[k])
			}
		}
		for _, k := range ol.keys {
			if _, ok := nl.items[k]; !ok {
				cp.Remove[name] = append(cp.Remove[name], k)
			}
		}
	}
	if len(cp.Upsert) == 0 && len(cp.Remove) == 0 && len(cp.Fields) == 0 {
		return nil
	}
	return cp
}

// snapshotJSON reassembles the indexed clusters without marshalling them again.
func (s *indexed) snapshotJSON(version uint64) []byte {
	raws := make([][]byte, 0, len(s.order))
	for _, id := range s.order {
		raws = append(raws, s.clusters[id].raw)
	}
	return slices.Concat(
		fmt.Appendf(nil, `{"version":%d,"clusters":[`, version),
		bytes.Join(raws, []byte(",")),
		[]byte("]}"),
	)
}

func sseFrame(event string, data []byte) []byte {
	return slices.Concat([]byte("event: "+event+"\ndata: "), data, []byte("\n\n"))
}
