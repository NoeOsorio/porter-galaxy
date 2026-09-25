import { useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import { getSlot, markSceneRendered, subscribeSlot } from "../lib/sceneSlot";

export default function SceneSlot() {
  const slot = useSyncExternalStore(subscribeSlot, getSlot);
  useFrame(markSceneRendered);
  return <>{slot.scene}</>;
}
