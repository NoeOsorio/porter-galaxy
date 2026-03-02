//go:build js && wasm

package main

// Porter Galaxy — WebAssembly frontend entry point
//
// This file is compiled with:
//   GOOS=js GOARCH=wasm go build -o public/main.wasm ./src
//
// It bridges the Go runtime to the browser via syscall/js.
// The rendering engine and UI components will be implemented here.

import (
	"syscall/js"
)

func main() {
	// Keep the WASM module alive until the browser unloads it.
	done := make(chan struct{})

	// TODO: initialize canvas renderer
	// TODO: register JS-callable functions (e.g. loadGraph, updateNode)
	// TODO: fetch initial graph data from backend API
	// TODO: start render loop

	js.Global().Get("console").Call("log", "Porter Galaxy WASM initialized")

	<-done
}
