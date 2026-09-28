// Command fakestream serves synthetic cluster snapshots over SSE so the frontend
// can be exercised at sizes no dev cluster has. See
// specs/002-render-engine-at-scale/contracts/fakestream.md.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand/v2"
	"net/http"
	"sync"
	"time"

	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
)

type generator struct {
	mu       sync.Mutex
	rng      *rand.Rand
	nodes    []string
	deps     []cluster.DeploymentInfo
	pods     []cluster.PodInfo
	serial   int
	snapshot []byte
}

func key(kind, ns, name string) string {
	if ns == "" {
		ns = "_"
	}
	return kind + "/" + ns + "/" + name
}

func newGenerator(pods, namespaces, depsPerNS, nodes int) *generator {
	g := &generator{rng: rand.New(rand.NewPCG(1, 2))}
	for i := range nodes {
		g.nodes = append(g.nodes, fmt.Sprintf("node-%02d", i))
	}
	for n := range namespaces {
		ns := fmt.Sprintf("ns-%02d", n)
		for d := range depsPerNS {
			name := fmt.Sprintf("app-%02d", d)
			g.deps = append(g.deps, cluster.DeploymentInfo{
				Key: key("deployment", ns, name), ID: name, Namespace: ns, State: cluster.StateRunning,
			})
		}
	}
	for range pods {
		g.pods = append(g.pods, g.newPod(g.deps[g.rng.IntN(len(g.deps))]))
	}
	g.refreshCounts()
	return g
}

func (g *generator) newPod(dep cluster.DeploymentInfo) cluster.PodInfo {
	g.serial++
	name := fmt.Sprintf("%s-%06d", dep.ID, g.serial)
	return cluster.PodInfo{
		Key:       key("pod", dep.Namespace, name),
		ID:        name,
		Namespace: dep.Namespace,
		NodeID:    g.nodes[g.rng.IntN(len(g.nodes))],
		State:     cluster.StateRunning,
		Owner:     cluster.Owner{Kind: "Deployment", Name: dep.ID},
	}
}

func (g *generator) refreshCounts() {
	count := map[string]int32{}
	for _, p := range g.pods {
		count[p.Namespace+"/"+p.Owner.Name]++
	}
	for i := range g.deps {
		n := count[g.deps[i].Namespace+"/"+g.deps[i].ID]
		g.deps[i].Desired, g.deps[i].Ready, g.deps[i].Available = n, n, n
		g.deps[i].State = cluster.StateRunning
		if n == 0 {
			g.deps[i].State = cluster.StateScaledToZero
		}
	}
}

// churn replaces n random pods with new ones in the same Deployment.
func (g *generator) churn(n int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for range n {
		i := g.rng.IntN(len(g.pods))
		old := g.pods[i]
		dep := cluster.DeploymentInfo{ID: old.Owner.Name, Namespace: old.Namespace}
		g.pods[i] = g.newPod(dep)
	}
	g.snapshot = nil
}

func (g *generator) build() []byte {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.snapshot != nil {
		return g.snapshot
	}
	c := cluster.Cluster{ID: "fake", Deployments: g.deps, Pods: g.pods, Metrics: map[string]cluster.Metrics{}}
	for _, n := range g.nodes {
		c.Nodes = append(c.Nodes, cluster.NodeInfo{
			Key: key("node", "", n), ID: n, State: cluster.StateRunning, Status: "Ready",
			Capacity: map[string]string{"cpu": "8", "memory": "32Gi"},
		})
	}

	lb := cluster.LoadBalancerInfo{Key: key("loadbalancer", "ingress-nginx", "controller"), DisplayName: "ingress-nginx/controller", Address: "fake.example.com"}
	c.LoadBalancers = []cluster.LoadBalancerInfo{lb}
	c.Topology = append(c.Topology, cluster.Link{From: "internet/_/internet", To: lb.Key, Active: true, Type: "internet"})
	routed := map[string]bool{}
	for _, d := range g.deps {
		svc := key("service", d.Namespace, d.ID)
		if !routed[d.Namespace] {
			routed[d.Namespace] = true
			ing := key("ingress", d.Namespace, "web")
			c.Topology = append(c.Topology,
				cluster.Link{From: lb.Key, To: ing, Active: true, Type: "lb"},
				cluster.Link{From: ing, To: svc, Active: true, Type: "ingress"},
			)
		}
		for _, p := range g.pods {
			if p.Namespace == d.Namespace && p.Owner.Name == d.ID {
				c.Topology = append(c.Topology, cluster.Link{From: svc, To: p.Key, Active: true, Type: "service"})
			}
		}
	}

	body, err := json.Marshal(cluster.Snapshot{Clusters: []cluster.Cluster{c}})
	if err != nil {
		log.Fatal(err)
	}
	g.snapshot = fmt.Appendf(nil, "data: %s\n\n", body)
	return g.snapshot
}

func main() {
	port := flag.Int("port", 4078, "listen port")
	pods := flag.Int("pods", 1000, "total pods")
	namespaces := flag.Int("namespaces", 20, "namespaces")
	depsPerNS := flag.Int("deployments-per-ns", 5, "deployments per namespace")
	nodes := flag.Int("nodes", 12, "cluster nodes")
	churnEvery := flag.Duration("churn", 500*time.Millisecond, "interval between updates; 0 disables churn")
	churnSize := flag.Int("churn-size", 3, "pods replaced per update")
	flag.Parse()

	g := newGenerator(*pods, *namespaces, *depsPerNS, *nodes)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, "ok") })
	mux.HandleFunc("GET /api/v1/clusters", func(w http.ResponseWriter, r *http.Request) {
		flusher := w.(http.Flusher)
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write(g.build())
		flusher.Flush()
		if *churnEvery <= 0 {
			<-r.Context().Done()
			return
		}
		ticker := time.NewTicker(*churnEvery)
		defer ticker.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case <-ticker.C:
				g.churn(*churnSize)
				if _, err := w.Write(g.build()); err != nil {
					return
				}
				flusher.Flush()
			}
		}
	})

	log.Printf("fakestream: %d pods, %d namespaces, churn %s on :%d", *pods, *namespaces, *churnEvery, *port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", *port), mux))
}
