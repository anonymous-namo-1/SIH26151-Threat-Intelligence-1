---
name: Workspace graph snapshots
description: Lifecycle rule for restoring saved graph positions, filters, hidden nodes, panel layout, and viewport.
---

Restore a saved investigation workspace atomically only after graph data has produced nodes. A restore must suppress automatic layout and automatic viewport fitting until the saved positions and viewport are applied.

**Why:** React Flow can schedule fitting after node measurement. Applying a saved viewport earlier, or feeding live position updates back as restore inputs, can overwrite the snapshot or create a render loop.

**How to apply:** Treat restoration as a one-time command keyed by the selected saved view. Apply its complete snapshot during graph initialization, mark it consumed afterward, and emit later position/viewport updates only from completed user gestures.