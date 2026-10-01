# Contract: URL State for Shared Links

The view state lives in the URL fragment, which browsers never send to the server:

```text
https://<host>/#v=clusters&d=3d&ns=default&sel=pod%2Fdefault%2Fweb-7d9-abc&cam=120,80,600,0,0,0
```

| Key | Values | Applied |
| --- | --- | --- |
| `v` | `topology`, `clusters` | Before the first render |
| `d` | `3d`, `2d` | Before the first render |
| `ns` | namespace name | After the first snapshot, if the namespace exists |
| `sel` | object key | After the first snapshot; opens the panel and flies to it |
| `cam` | six integers: position x,y,z then target x,y,z | After `sel`, or alone when nothing is selected |

- Every key is optional; unknown keys and malformed values are ignored.
- The fragment never holds credentials, tokens, or session data. Opening a link without a session
  shows the login at the same URL, so the fragment survives signing in.
- The app rewrites the fragment with `history.replaceState` (no new history entries), at most every
  500 ms while the camera moves.
- A `sel` that no longer exists opens `ns` (or the whole view) with the notice "That object no
  longer exists".
