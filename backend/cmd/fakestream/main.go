// Command fakestream serves synthetic cluster snapshots over SSE so the frontend
// can be exercised at sizes no dev cluster has. See
// specs/002-render-engine-at-scale/contracts/fakestream.md.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/noeosorio/porter-galaxy/backend/internal/api"
	"github.com/noeosorio/porter-galaxy/backend/internal/cluster"
)

type generator struct {
	mu     sync.Mutex
	rng    *rand.Rand
	nodes  []string
	deps   []cluster.WorkloadInfo // churned: their pods are replaced over time
	others []cluster.WorkloadInfo // StatefulSets, a DaemonSet, a CronJob and its Jobs
	pods   []cluster.PodInfo
	fixed  []cluster.PodInfo // pods of `others`, never churned
	serial int
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
			g.deps = append(g.deps, workload("Deployment", ns, name, cluster.StateRunning, 0, nil))
		}
		if n%4 == 0 {
			db := workload("StatefulSet", ns, "db", cluster.StateRunning, 3, nil)
			g.others = append(g.others, db)
			for range 3 {
				g.fixed = append(g.fixed, g.newPod(db, cluster.StateRunning, ""))
			}
		}
	}
	agent := workload("DaemonSet", "ns-00", "agent", cluster.StateRunning, int32(nodes), nil)
	g.others = append(g.others, agent)
	for _, node := range g.nodes {
		g.fixed = append(g.fixed, g.newPod(agent, cluster.StateRunning, node))
	}
	g.others = append(g.others, workload("CronJob", "ns-01", "report", cluster.StateCompleted, 0, nil))
	for i := range 2 {
		job := workload("Job", "ns-01", fmt.Sprintf("report-%d", 2900+i), cluster.StateCompleted, 1, &cluster.Owner{Kind: "CronJob", Name: "report"})
		g.others = append(g.others, job)
		g.fixed = append(g.fixed, g.newPod(job, cluster.StateCompleted, ""))
	}
	for range pods {
		g.pods = append(g.pods, g.newPod(g.deps[g.rng.IntN(len(g.deps))], cluster.StateRunning, ""))
	}
	g.refreshCounts()
	return g
}

func workload(kind, ns, name string, state cluster.State, n int32, owner *cluster.Owner) cluster.WorkloadInfo {
	return cluster.WorkloadInfo{
		Key: key(strings.ToLower(kind), ns, name), Kind: kind, ID: name, Namespace: ns,
		State: state, Desired: n, Ready: n, Owner: owner,
	}
}

// newPod places a pod of w on node, or on a random node when node is empty.
func (g *generator) newPod(w cluster.WorkloadInfo, state cluster.State, node string) cluster.PodInfo {
	g.serial++
	name := fmt.Sprintf("%s-%06d", w.ID, g.serial)
	if node == "" {
		node = g.nodes[g.rng.IntN(len(g.nodes))]
	}
	return cluster.PodInfo{
		Key:       key("pod", w.Namespace, name),
		ID:        name,
		Namespace: w.Namespace,
		NodeID:    node,
		State:     state,
		Owner:     cluster.Owner{Kind: w.Kind, Name: w.ID},
	}
}

func (g *generator) refreshCounts() {
	count := map[string]int32{}
	for _, p := range g.pods {
		count[p.Namespace+"/"+p.Owner.Name]++
	}
	for i := range g.deps {
		n := count[g.deps[i].Namespace+"/"+g.deps[i].ID]
		g.deps[i].Desired, g.deps[i].Ready = n, n
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
		dep := cluster.WorkloadInfo{Kind: "Deployment", ID: old.Owner.Name, Namespace: old.Namespace}
		g.pods[i] = g.newPod(dep, cluster.StateRunning, "")
	}
}

// Build implements cluster.SnapshotBuilder so the stream goes through the
// same hub and encoder as the real backend.
func (g *generator) Build() cluster.Snapshot {
	g.mu.Lock()
	defer g.mu.Unlock()
	c := cluster.Cluster{
		ID:              "fake",
		Workloads:       slices.Concat(g.deps, g.others),
		Pods:            slices.Concat(g.pods, g.fixed),
		PVCs:            []cluster.PVCInfo{},
		HPAs:            []cluster.HPAInfo{},
		NetworkPolicies: []cluster.NetworkPolicyInfo{},
		Namespaces:      []cluster.NamespaceInfo{},
	}
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
	allPods := slices.Concat(g.pods, g.fixed)
	for _, d := range slices.Concat(g.deps, g.others) {
		if d.Kind != "Deployment" && d.Kind != "StatefulSet" {
			continue
		}
		svc := key("service", d.Namespace, d.ID)
		if !routed[d.Namespace] {
			routed[d.Namespace] = true
			ing := key("ingress", d.Namespace, "web")
			c.Topology = append(c.Topology,
				cluster.Link{From: lb.Key, To: ing, Active: true, Type: "lb"},
				cluster.Link{From: ing, To: svc, Active: true, Type: "ingress"},
			)
		}
		for _, p := range allPods {
			if p.Namespace == d.Namespace && p.Owner.Kind == d.Kind && p.Owner.Name == d.ID {
				c.Topology = append(c.Topology, cluster.Link{From: svc, To: p.Key, Active: true, Type: "service"})
			}
		}
	}

	return cluster.Snapshot{Clusters: []cluster.Cluster{c}}
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
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	hub := api.NewHub(g, logger)
	notify := make(chan struct{}, 1)
	ctx := context.Background()
	go hub.Run(ctx, notify, *churnEvery/2)
	if *churnEvery > 0 {
		go func() {
			for range time.Tick(*churnEvery) {
				g.churn(*churnSize)
				notify <- struct{}{}
			}
		}()
	}

	mux := http.NewServeMux()
	api.NewHandler(hub, func() bool { return true }, logger).RegisterRoutes(mux)

	log.Printf("fakestream: %d pods, %d namespaces, churn %s on :%d", *pods, *namespaces, *churnEvery, *port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", *port), mux))
}
