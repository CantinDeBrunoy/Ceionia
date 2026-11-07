import { describe, it, expect } from 'vitest';
import { weakGpu } from '../src/render/gpu';

describe('machine modeste d’après la carte graphique', () => {
  it('les cartes dédiées ne le sont pas', () => {
    expect(weakGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(weakGpu('ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(false);
    expect(weakGpu('ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0, D3D11)', 2)).toBe(false);
    expect(weakGpu('Apple M1')).toBe(false);
  });
  it('les puces intégrées et le rendu logiciel le sont', () => {
    expect(weakGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(weakGpu('ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(weakGpu('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(weakGpu('ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(true);
    expect(weakGpu('Google SwiftShader')).toBe(true);
    expect(weakGpu('Mali-G52')).toBe(true);
  });
  it('carte inconnue : on se fie au nombre de cœurs', () => {
    expect(weakGpu('', 2)).toBe(true);
    expect(weakGpu('', 8)).toBe(false);
    expect(weakGpu('Mystery GPU', 4)).toBe(false);
  });
});
