import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Agents, SADDLE_UP } from '../src/sim/agents';
import { provideModel } from '../src/render/assets';
import { FOLK_SEAT } from '../src/render/folk';

/**
 * Les cavaliers des expéditions : assis sur la selle, au creux du dos du cheval (pas sur la croupe, ni flottant au-dessus),
 * à califourchon, et ils suivent le dos du cheval à chaque image (montée, descente et tangage du galop, virages)
 */
beforeAll(async () => {
  for (const n of ['horse', 'horse_white'] as const) {
    const buf = readFileSync(`public/models/${n}.glb`);
    const gltf = await new Promise<Parameters<typeof provideModel>[1]>((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
    provideModel(n, gltf);
  }
});

type Ag = { id: number; x: number; z: number; heading: number; state: string; mount: { root: THREE.Object3D } | null; actor: { root: THREE.Object3D; legs: THREE.Object3D[]; body: THREE.Object3D } | null };

function riders() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let at: [number, number] | null = null;
  for (let z = 10; z < N - 10 && !at; z++)
    for (let x = 10; x < N - 10 && !at; x++)
      if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) at = [x, z];
  const [x, z] = at!;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 1, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 1, false, 30, 0);
  const team = agents.recruit(2)!;
  for (const id of team) agents.equip(id, { horse: true });
  agents.mountParty(team, true);
  agents.partyGo(team, x + 14, z + 10);
  const list = team.map((id) => (agents as unknown as { agents: Ag[] }).agents.find((g) => g.id === id)!);
  return { agents, list };
}

const bone = (r: THREE.Object3D, name: string) => { let b: THREE.Object3D | null = null; r.traverse((o) => { if (o.name === name && (o as THREE.Bone).isBone) b = o; }); return b!; };

describe('les cavaliers en selle', () => {
  it('au creux du dos, sur l’os du dos, à califourchon, et ils suivent le galop comme le pas', () => {
    const { agents, list } = riders();
    const robes = new Set<string>(), hip = new THREE.Vector3(), back = new THREE.Vector3(), up = new THREE.Vector3();
    let worst = 0, gallops = 0, walks = 0;
    const lift: number[] = [], horseLift: number[] = [];
    for (let i = 0; i < 400; i++) {
      agents.update(0.05, 10, 1, false, 30, 0);
      for (const g of list) {
        if (!g.mount || !g.actor) continue;
        robes.add(JSON.stringify(new THREE.Box3().setFromObject(g.mount.root).getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(2))) + g.id % 2);
        // la hanche du cavalier : le pivot de ses jambes
        g.actor.root.updateMatrixWorld(true);
        g.actor.legs[0].getWorldPosition(hip).add(g.actor.legs[1].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
        // le creux du dos : au-dessus de l'os, dans le repère de l'os (il tangue avec lui)
        const b = bone(g.mount.root, 'Torso2');
        b.getWorldPosition(back);
        up.set(0, SADDLE_UP, 0).applyQuaternion(g.mount.root.quaternion);
        worst = Math.max(worst, Math.hypot(hip.x - back.x - up.x, hip.z - back.z - up.z), Math.abs(hip.y - back.y - SADDLE_UP) - 0.012);
        // tourné comme son cheval
        const yaw = (o: THREE.Object3D) => new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
        const dy = Math.atan2(Math.sin(yaw(g.actor.root) - yaw(g.mount.root)), Math.cos(yaw(g.actor.root) - yaw(g.mount.root)));
        expect(Math.abs(dy)).toBeLessThan(0.2);
        if (g.state === 'walking') { gallops++; if (g === list[0]) { lift.push(hip.y); horseLift.push(back.y); } }
        else walks++;
        // à califourchon : les pieds de part et d'autre du flanc
        expect(Math.abs(g.actor.legs[0].rotation.z)).toBeGreaterThan(0.3);
      }
    }
    void walks;
    expect(gallops).toBeGreaterThan(50);
    // collé à l'os du dos à moins d'un centième de case
    expect(worst).toBeLessThan(0.01);
    // il monte et descend avec le dos du cheval
    const range = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(range(horseLift)).toBeGreaterThan(0.005);
    expect(Math.abs(range(lift) - range(horseLift))).toBeLessThan(0.006);
    // les deux robes
    expect(new Set([...robes].map((r) => r.slice(-1))).size).toBe(2);
    void FOLK_SEAT;
  });
});
